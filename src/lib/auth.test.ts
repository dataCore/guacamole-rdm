import { describe, expect, it, vi } from 'vitest';
import { AuthError, GuacamoleApi, type AuthResult, type TokenStatus } from './api';
import {
  SSO_STATE_KEY,
  TOKEN_STORAGE_KEY,
  appRedirectUri,
  bootstrap,
  clearStoredToken,
  extraFields,
  parseFragment,
  readStoredToken,
  rewriteRedirectUri,
  type BootstrapEnv,
} from './auth';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

type TestEnv = BootstrapEnv & {
  storage: ReturnType<typeof memoryStorage>;
  session: ReturnType<typeof memoryStorage>;
  navigate: ReturnType<typeof vi.fn>;
  clearHash: ReturnType<typeof vi.fn>;
};

const ok: AuthResult = { authToken: 'T1', username: 'u', dataSource: 'postgresql', availableDataSources: ['postgresql'] };
const ssoUrl =
  'https://login.example/auth?scope=openid&response_type=id_token&client_id=c&redirect_uri=https%3A%2F%2Fremote.example%2Fguacamole%2F&nonce=n1';
const ssoOffered = new AuthError('Invalid login.', 'INVALID_CREDENTIALS', [{ name: 'id_token', type: 'REDIRECT', redirectUrl: ssoUrl }]);

function env(overrides: { hash?: string; search?: string; storage?: Record<string, string>; session?: Record<string, string> } = {}): TestEnv {
  return {
    location: { origin: 'https://remote.example', pathname: '/', hash: overrides.hash ?? '', search: overrides.search ?? '' },
    storage: memoryStorage(overrides.storage),
    session: memoryStorage(overrides.session),
    clearHash: vi.fn(),
    navigate: vi.fn(),
    randomState: () => 'S1',
    autoSso: true,
  } as TestEnv;
}

function api(authenticate: (params: Record<string, string>) => Promise<AuthResult>, status: TokenStatus = 'valid'): GuacamoleApi {
  const instance = new GuacamoleApi(new URL('https://remote.example/guacamole/'));
  instance.authenticate = vi.fn(authenticate);
  instance.tokenStatus = vi.fn(async () => status);
  return instance;
}

const refuse = (error: Error = ssoOffered) => async (): Promise<AuthResult> => {
  throw error;
};

describe('token storage', () => {
  it('reads the JSON-encoded token Guacamole UI writes', () => {
    expect(readStoredToken(memoryStorage({ [TOKEN_STORAGE_KEY]: '"ABC"' }))).toBe('ABC');
    expect(readStoredToken(memoryStorage({ [TOKEN_STORAGE_KEY]: 'not json' }))).toBeNull();
    expect(readStoredToken(memoryStorage())).toBeNull();
  });

  it('clears only its own token, not a newer one from Guacamole UI', () => {
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: '"NEWER"' });
    clearStoredToken(storage, 'MINE');
    expect(storage.data.get(TOKEN_STORAGE_KEY)).toBe('"NEWER"');
    clearStoredToken(storage, 'NEWER');
    expect(storage.data.has(TOKEN_STORAGE_KEY)).toBe(false);
  });
});

describe('parseFragment', () => {
  it('accepts the plain and the Guacamole-router fragment', () => {
    expect(parseFragment('#id_token=abc&state=s&session_state=x')).toMatchObject({ idToken: 'abc', state: 's' });
    expect(parseFragment('#/?id_token=abc').idToken).toBe('abc');
    expect(parseFragment('#/settings').idToken).toBeNull();
    expect(parseFragment('#error=access_denied&error_description=nope')).toMatchObject({
      error: 'access_denied',
      errorDescription: 'nope',
    });
  });
});

describe('redirect_uri', () => {
  it('replaces only redirect_uri and keeps the server nonce', () => {
    const url = new URL(rewriteRedirectUri(ssoUrl, 'https://remote.example/'));
    expect(url.searchParams.get('redirect_uri')).toBe('https://remote.example/');
    expect(url.searchParams.get('nonce')).toBe('n1');
  });

  it('derives the redirect target from the page without query or fragment', () => {
    expect(appRedirectUri({ origin: 'https://remote.example', pathname: '/' })).toBe('https://remote.example/');
    expect(appRedirectUri({ origin: 'https://remote.example', pathname: '/prefix/' })).toBe('https://remote.example/prefix/');
  });
});

describe('extraFields', () => {
  it('keeps what Guacamole asks for beyond username, password and SSO', () => {
    const fields = extraFields([
      { name: 'username', type: 'USERNAME' },
      { name: 'password', type: 'PASSWORD' },
      { name: 'guac-totp', type: 'GUAC_TOTP_CODE' },
    ]);
    expect(fields.map((field) => field.name)).toEqual(['guac-totp']);
  });
});

describe('bootstrap', () => {
  it('redirects to SSO with this page as redirect_uri and a fresh state', async () => {
    const e = env();
    expect((await bootstrap(api(refuse()), e)).kind).toBe('redirecting');
    const target = new URL(e.navigate.mock.calls[0][0]);
    expect(target.searchParams.get('redirect_uri')).toBe('https://remote.example/');
    expect(target.searchParams.get('state')).toBe('S1');
    expect(e.session.data.get(SSO_STATE_KEY)).toBe('S1');
  });

  it('exchanges an id_token that carries this tab’s state', async () => {
    const e = env({ hash: '#id_token=jwt&state=S1', session: { [SSO_STATE_KEY]: 'S1' } });
    const a = api(async () => ok);
    expect((await bootstrap(a, e)).kind).toBe('authenticated');
    expect(a.authenticate).toHaveBeenCalledWith({ id_token: 'jwt' });
    expect(e.clearHash).toHaveBeenCalled();
    expect(e.storage.data.get(TOKEN_STORAGE_KEY)).toBe('"T1"');
    expect(e.session.data.has(SSO_STATE_KEY)).toBe(false);
  });

  it('refuses an id_token this tab did not ask for (login CSRF)', async () => {
    for (const session of [{}, { [SSO_STATE_KEY]: 'OTHER' }] as Record<string, string>[]) {
      const e = env({ hash: '#id_token=attacker&state=S1', session });
      const a = api(refuse());
      const state = await bootstrap(a, e);
      expect(state).toMatchObject({ kind: 'login', error: { kind: 'ssoState' } });
      expect(a.authenticate).not.toHaveBeenCalledWith({ id_token: 'attacker' });
      expect(e.navigate).not.toHaveBeenCalled();
    }
  });

  it('shows an identity provider error instead of looping back into it', async () => {
    const e = env({ hash: '#error=access_denied&error_description=not+assigned' });
    const state = await bootstrap(api(refuse()), e);
    expect(state).toMatchObject({ kind: 'login', error: { kind: 'ssoDenied', detail: 'not assigned' } });
    expect(e.clearHash).toHaveBeenCalled();
    expect(e.navigate).not.toHaveBeenCalled();
  });

  it('does not loop back into SSO after Guacamole rejects the id_token', async () => {
    const e = env({ hash: '#id_token=bad&state=S1', session: { [SSO_STATE_KEY]: 'S1' } });
    const state = await bootstrap(api(refuse()), e);
    expect(state).toMatchObject({ kind: 'login', error: { kind: 'ssoRejected' } });
    expect(e.navigate).not.toHaveBeenCalled();
  });

  it('reuses a stored token Guacamole confirms', async () => {
    const e = env({ storage: { [TOKEN_STORAGE_KEY]: '"OLD"' } });
    const a = api(async () => ok, 'valid');
    expect((await bootstrap(a, e)).kind).toBe('authenticated');
    expect(a.authenticate).toHaveBeenCalledWith({ token: 'OLD' });
  });

  it('drops a rejected token without a login attempt (no brute-force strike)', async () => {
    const e = env({ storage: { [TOKEN_STORAGE_KEY]: '"STALE"' }, search: '?local' });
    const a = api(refuse(new AuthError('Invalid login', 'INVALID_CREDENTIALS', [])), 'invalid');
    expect((await bootstrap(a, e)).kind).toBe('login');
    expect(a.authenticate).not.toHaveBeenCalledWith({ token: 'STALE' });
    expect(e.storage.data.has(TOKEN_STORAGE_KEY)).toBe(false);
  });

  it('keeps the token when Guacamole cannot be asked', async () => {
    const e = env({ storage: { [TOKEN_STORAGE_KEY]: '"MAYBE"' } });
    const state = await bootstrap(api(refuse(new TypeError('fetch failed')), 'unknown'), e);
    expect(state).toMatchObject({ kind: 'login', error: { kind: 'unreachable' } });
    expect(e.storage.data.get(TOKEN_STORAGE_KEY)).toBe('"MAYBE"');
  });

  it('accepts an automatic login (anonymous, header based)', async () => {
    const e = env();
    expect((await bootstrap(api(async () => ok), e)).kind).toBe('authenticated');
    expect(e.storage.data.get(TOKEN_STORAGE_KEY)).toBe('"T1"');
  });

  it('shows the password form in break-glass mode instead of redirecting', async () => {
    const e = env({ search: '?local' });
    expect(await bootstrap(api(refuse()), e)).toMatchObject({ kind: 'login', passwordLogin: true });
    expect(e.navigate).not.toHaveBeenCalled();
  });
});
