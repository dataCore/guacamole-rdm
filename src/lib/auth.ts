import { AuthError, type AuthResult, type ExpectedField, type GuacamoleApi } from './api';

/** Key and encoding Guacamole's own UI uses (localStorageService stores
 *  JSON). Sharing it means one login covers both UIs on the same origin. */
export const TOKEN_STORAGE_KEY = 'GUAC_AUTH_TOKEN';

/** sessionStorage key of the `state` this tab sent to the identity provider. */
export const SSO_STATE_KEY = 'rdm.ssoState';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem' | 'removeItem'>;
type FullStorage = ReadStorage & WriteStorage;

export function readStoredToken(storage: ReadStorage): string | null {
  try {
    const raw = storage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredToken(storage: WriteStorage, token: string | null): void {
  try {
    if (token) storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    else storage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage disabled: the session still works, it just is not remembered.
  }
}

/** Forget a token only if it is still the one stored: Guacamole's own UI
 *  (another tab) may have put a fresh, valid one there in the meantime. */
export function clearStoredToken(storage: FullStorage, token: string | null): void {
  if (token && readStoredToken(storage) === token) writeStoredToken(storage, null);
}

/** What the identity provider sends back in the URL fragment (implicit
 *  flow). Guacamole's UI may already have rewritten it to its router form
 *  "#/?id_token=...", so both shapes are accepted. */
export interface SsoReturn {
  idToken: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
}

export function parseFragment(hash: string): SsoReturn {
  const params = new URLSearchParams(hash.replace(/^#/, '').replace(/^\/?\?/, ''));
  return {
    idToken: params.get('id_token'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  };
}

/** Guacamole builds the authorization URL (with its own nonce) but always
 *  points redirect_uri at its own UI. Swap it for this app's URL so the user
 *  comes back here; the identity provider must list that URI as valid. */
export function rewriteRedirectUri(authorizationUrl: string, redirectUri: string): string {
  const url = new URL(authorizationUrl);
  url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
}

/** This page without query and fragment: the redirect target for SSO. */
export function appRedirectUri(location: Pick<Location, 'origin' | 'pathname'>): string {
  return location.origin + location.pathname;
}

export function findRedirect(expected: ExpectedField[]): string | null {
  return expected.find((field) => field.type === 'REDIRECT' && field.redirectUrl)?.redirectUrl ?? null;
}

export function acceptsPassword(expected: ExpectedField[]): boolean {
  return expected.some((field) => field.type === 'PASSWORD');
}

/** Fields Guacamole asks for beyond username and password, e.g. a TOTP code
 *  after the password was accepted. */
export function extraFields(expected: ExpectedField[]): ExpectedField[] {
  return expected.filter((field) => !['USERNAME', 'PASSWORD', 'REDIRECT'].includes(field.type));
}

/** Why the login screen is shown. Translated by the UI, never shown raw. */
export type LoginError =
  | { kind: 'expired' }
  | { kind: 'ssoRejected' }
  | { kind: 'ssoDenied'; detail: string | null }
  | { kind: 'ssoState' }
  | { kind: 'unreachable' };

export type AuthState =
  | { kind: 'authenticated'; result: AuthResult }
  | { kind: 'login'; ssoUrl: string | null; passwordLogin: boolean; error: LoginError | null }
  | { kind: 'redirecting' };

export interface BootstrapEnv {
  location: Pick<Location, 'origin' | 'pathname' | 'hash' | 'search'>;
  /** localStorage: the token shared with Guacamole's UI. */
  storage: FullStorage;
  /** sessionStorage: the SSO state of this tab only. */
  session: FullStorage;
  clearHash: () => void;
  navigate: (url: string) => void;
  randomState: () => string;
  autoSso: boolean;
}

/** Leave for the identity provider with a fresh `state`, remembered in this
 *  tab. Only an answer carrying it back is accepted (login CSRF). */
export function startSso(env: Pick<BootstrapEnv, 'session' | 'navigate' | 'randomState'>, ssoUrl: string): void {
  const state = env.randomState();
  try {
    env.session.setItem(SSO_STATE_KEY, state);
  } catch {
    // Without sessionStorage the answer cannot be verified and is refused.
  }
  const url = new URL(ssoUrl);
  url.searchParams.set('state', state);
  env.navigate(url.toString());
}

/** Resolves the session on page load: SSO return, then a remembered token
 *  (ours or Guacamole UI's), then whatever login Guacamole offers. */
export async function bootstrap(api: GuacamoleApi, env: BootstrapEnv): Promise<AuthState> {
  const sso = parseFragment(env.location.hash);
  if (sso.idToken || sso.error) {
    env.clearHash();
    const expectedState = takeSsoState(env.session);

    // The identity provider refused (user cancelled, not assigned, ...).
    // Show it instead of redirecting straight back into the same refusal.
    if (sso.error) return loginOptions(api, env, { kind: 'ssoDenied', detail: sso.errorDescription ?? sso.error });

    // A token this tab did not ask for may be someone else's login.
    if (!expectedState || sso.state !== expectedState) return loginOptions(api, env, { kind: 'ssoState' });

    try {
      return authenticated(api, env, await api.authenticate({ id_token: sso.idToken! }));
    } catch (e) {
      return loginOptions(api, env, e instanceof AuthError ? { kind: 'ssoRejected' } : { kind: 'unreachable' });
    }
  }

  const stored = readStoredToken(env.storage);
  if (stored) {
    // Check first: resuming a stale token (e.g. after a Guacamole restart)
    // would count as a failed login and, five times, ban the address.
    const status = await api.tokenStatus(stored);
    if (status === 'valid') {
      try {
        return authenticated(api, env, await api.authenticate({ token: stored }));
      } catch {
        // expired between the two calls; fall through to a fresh login
      }
    }
    // Only a token Guacamole actually rejected is forgotten; when it cannot
    // be asked (restarting, proxy 502), the token may well still be good.
    if (status !== 'unknown') clearStoredToken(env.storage, stored);
  }

  return loginOptions(api, env, null);
}

export async function loginOptions(api: GuacamoleApi, env: BootstrapEnv, error: LoginError | null): Promise<AuthState> {
  let expected: ExpectedField[] = [];
  try {
    // Without credentials: either an automatic login (anonymous, header
    // based, ...) succeeds, or Guacamole says what it would accept.
    return authenticated(api, env, await api.authenticate({}));
  } catch (e) {
    if (e instanceof AuthError) expected = e.expected;
    else error ??= { kind: 'unreachable' };
  }

  const redirect = findRedirect(expected);
  const ssoUrl = redirect ? rewriteRedirectUri(redirect, appRedirectUri(env.location)) : null;
  // "?local" is the break-glass switch: show the password form even when SSO
  // would normally take over.
  const local = new URLSearchParams(env.location.search).has('local');

  if (ssoUrl && env.autoSso && !local && !error) {
    startSso(env, ssoUrl);
    return { kind: 'redirecting' };
  }
  // The password form is offered when Guacamole asks for it, and always in
  // break-glass mode: the database provider still accepts passwords even
  // when SSO has priority and is the only thing announced.
  return { kind: 'login', ssoUrl, passwordLogin: acceptsPassword(expected) || local || !ssoUrl, error };
}

/** Username, password and whatever further fields Guacamole asked for. A
 *  further AuthError (e.g. "now the TOTP code") reaches the caller. */
export async function passwordLogin(
  api: GuacamoleApi,
  env: Pick<BootstrapEnv, 'storage'>,
  params: Record<string, string>,
): Promise<AuthResult> {
  const result = await api.authenticate(params);
  writeStoredToken(env.storage, result.authToken);
  return result;
}

function takeSsoState(session: FullStorage): string | null {
  try {
    const state = session.getItem(SSO_STATE_KEY);
    session.removeItem(SSO_STATE_KEY);
    return state;
  } catch {
    return null;
  }
}

function authenticated(api: GuacamoleApi, env: Pick<BootstrapEnv, 'storage'>, result: AuthResult): AuthState {
  api.token = result.authToken;
  writeStoredToken(env.storage, result.authToken);
  return { kind: 'authenticated', result };
}
