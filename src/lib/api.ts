import type { GuacGroup } from './tree';

export type TokenStatus = 'valid' | 'invalid' | 'unknown';

/** Response of POST api/tokens. */
export interface AuthResult {
  authToken: string;
  username: string;
  dataSource: string;
  availableDataSources: string[];
}

/** One credential Guacamole asks for, from the "expected" list of a failed
 *  login. SSO extensions announce themselves as type REDIRECT. */
export interface ExpectedField {
  name: string;
  type: string;
  redirectUrl?: string;
  /** TOTP enrollment: QR code (data: URI) of the secret to set up. */
  qrCode?: string;
}

/** Login rejected; carries what Guacamole would accept instead. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly type: string,
    readonly expected: ExpectedField[],
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** The token is no longer valid (expired, revoked, or logged out elsewhere). */
export class SessionExpiredError extends Error {
  constructor() {
    super('Guacamole session expired');
    this.name = 'SessionExpiredError';
  }
}

/** Thin client for the parts of Guacamole's REST API this app needs. */
export class GuacamoleApi {
  token: string | null = null;

  constructor(readonly base: URL) {}

  url(path: string): URL {
    return new URL(path, this.base);
  }

  async authenticate(params: Record<string, string>): Promise<AuthResult> {
    const response = await fetch(this.url('api/tokens'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AuthError(body?.message ?? `HTTP ${response.status}`, body?.type ?? 'UNKNOWN', body?.expected ?? []);
    }
    const result = body as AuthResult;
    this.token = result.authToken;
    return result;
  }

  /** Whether a token is still valid, without an authentication attempt:
   *  POST api/tokens with a stale token counts as a failed login for
   *  Guacamole's brute-force ban, HEAD api/session does not. Only 401/403
   *  mean "invalid"; a network error or a 5xx from the proxy while Guacamole
   *  restarts says nothing about the token. */
  async tokenStatus(token: string): Promise<TokenStatus> {
    const response = await fetch(this.url('api/session'), {
      method: 'HEAD',
      headers: { 'Guacamole-Token': token },
    }).catch(() => null);
    if (response?.ok) return 'valid';
    if (response && (response.status === 401 || response.status === 403)) return 'invalid';
    return 'unknown';
  }

  async getTree(dataSource: string): Promise<GuacGroup> {
    return this.#get(`api/session/data/${encodeURIComponent(dataSource)}/connectionGroups/ROOT/tree`);
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await fetch(this.url('api/session'), {
      method: 'DELETE',
      headers: { 'Guacamole-Token': this.token },
    }).catch(() => undefined);
    this.token = null;
  }

  async #get<T>(path: string): Promise<T> {
    if (!this.token) throw new SessionExpiredError();
    const response = await fetch(this.url(path), { headers: { 'Guacamole-Token': this.token } });
    if (response.status === 401 || response.status === 403) throw new SessionExpiredError();
    if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
}
