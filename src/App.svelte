<script lang="ts">
  import { onMount } from 'svelte';
  import { GuacamoleApi } from './lib/api';
  import {
    bootstrap,
    clearStoredToken,
    loginOptions,
    passwordLogin,
    startSso,
    type AuthState,
    type BootstrapEnv,
    type LoginError,
  } from './lib/auth';
  import { loadConfig, resolveGuacamoleBase, type RdmConfig } from './lib/config';
  import { loadGuacamoleLibrary } from './lib/guacamole';
  import { initLanguage, t } from './lib/i18n';
  import { safeStorage } from './lib/storage';
  import { theme } from './lib/theme.svelte';
  import Login from './components/Login.svelte';
  import Shell from './components/Shell.svelte';

  let config = $state<RdmConfig | null>(null);
  let auth = $state<AuthState | null>(null);
  let fatal = $state<string | null>(null);

  function randomState(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let api = $state<GuacamoleApi | null>(null);
  let env: BootstrapEnv | null = null;

  onMount(async () => {
    try {
      config = await loadConfig();
      initLanguage(config.language);
      document.title = config.title;
      await theme.use(config.theme);
      api = new GuacamoleApi(resolveGuacamoleBase(config, window.location.origin));
      env = {
        location: window.location,
        storage: safeStorage(),
        session: safeStorage('sessionStorage'),
        randomState,
        clearHash: () => history.replaceState(null, '', window.location.pathname + window.location.search),
        navigate: (url) => window.location.assign(url),
        autoSso: config.autoSso,
      };
      await loadGuacamoleLibrary(api.base);
      auth = await bootstrap(api, env);
    } catch (e) {
      fatal = e instanceof Error ? e.message : String(e);
    }
  });

  /** Throws the AuthError when Guacamole wants more (e.g. a TOTP code);
   *  the login form shows the extra fields and calls again. */
  async function login(params: Record<string, string>): Promise<void> {
    if (!api || !env) return;
    const result = await passwordLogin(api, env, params);
    auth = { kind: 'authenticated', result };
  }

  function sso(url: string): void {
    if (env) startSso(env, url);
  }

  async function showLogin(error: LoginError | null): Promise<void> {
    if (!api || !env) return;
    // No automatic SSO redirect here: after a logout or an expired session
    // the user should see why, not bounce straight back into the IdP.
    auth = await loginOptions(api, { ...env, autoSso: false }, error);
  }

  async function logout(): Promise<void> {
    if (!api || !env) return;
    const token = api.token;
    await api.logout();
    clearStoredToken(env.storage, token);
    await showLogin(null);
  }

  /** A tab or an API call hit an auth error: check whether the login is
   *  really gone before throwing the user out. */
  let verifying = false;
  async function verifyAuth(): Promise<void> {
    if (!api || !env || verifying || auth?.kind !== 'authenticated') return;
    verifying = true;
    const token = api.token;
    try {
      // HEAD, not a login attempt: a dead token must not count towards
      // Guacamole's brute-force ban. "unknown" (Guacamole restarting, proxy
      // 502) keeps the session: the tabs can reconnect once it is back.
      if (token && (await api.tokenStatus(token)) !== 'invalid') return;
    } finally {
      verifying = false;
    }
    clearStoredToken(env.storage, token);
    await showLogin({ kind: 'expired' });
  }
</script>

{#if fatal}
  <main class="center g-grid-paper">
    <div class="fatal">
      <p>{t.fatal}</p>
      <code>{fatal}</code>
    </div>
  </main>
{:else if !config || !auth || auth.kind === 'redirecting'}
  <main class="center g-grid-paper">
    <p class="label">{auth?.kind === 'redirecting' ? t.redirecting : t.loading}</p>
  </main>
{:else if auth.kind === 'login'}
  <Login {config} ssoUrl={auth.ssoUrl} passwordLogin={auth.passwordLogin} error={auth.error} onLogin={login} onSso={sso} />
{:else if api}
  <Shell {config} {api} user={auth.result} onLogout={logout} {verifyAuth} />
{/if}

<style>
  .center {
    height: 100%;
    display: grid;
    place-items: center;
  }

  .fatal {
    max-width: 40em;
    padding: 16px;
    border: 1px solid var(--g-signal);
    background: var(--g-panel);
    color: var(--g-signal-text);
  }

  .fatal p {
    margin: 0 0 8px;
  }

  .fatal code {
    font-family: var(--g-font-mono);
    font-size: 12px;
    color: var(--g-text-2);
    word-break: break-word;
  }
</style>
