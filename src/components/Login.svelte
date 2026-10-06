<script lang="ts">
  import { AuthError, type ExpectedField } from '../lib/api';
  import { extraFields, type LoginError } from '../lib/auth';
  import type { RdmConfig } from '../lib/config';
  import { t } from '../lib/i18n';
  import { theme } from '../lib/theme.svelte';

  interface Props {
    config: RdmConfig;
    ssoUrl: string | null;
    passwordLogin: boolean;
    error: LoginError | null;
    onLogin: (params: Record<string, string>) => Promise<void>;
    onSso: (url: string) => void;
  }

  let { config, ssoUrl, passwordLogin, error, onLogin, onSso }: Props = $props();

  let username = $state('');
  let password = $state('');
  /** Further fields Guacamole asked for after the password, e.g. TOTP. */
  let extra = $state<ExpectedField[]>([]);
  let extraValues = $state<Record<string, string>>({});
  let busy = $state(false);
  let formError = $state<string | null>(null);

  const errorText = $derived.by(() => {
    switch (error?.kind) {
      case 'expired':
        return t.errors.expired;
      case 'ssoRejected':
        return t.login.ssoFailed;
      case 'ssoDenied':
        return error.detail ? `${t.login.ssoDenied} (${error.detail})` : t.login.ssoDenied;
      case 'ssoState':
        return t.login.ssoState;
      case 'unreachable':
        return t.login.unreachable;
      default:
        return null;
    }
  });

  function fieldLabel(field: ExpectedField): string {
    return field.type === 'GUAC_TOTP_CODE' ? t.login.code : field.name;
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    busy = true;
    formError = null;
    try {
      await onLogin({ username, password, ...extraValues });
    } catch (e) {
      const more = e instanceof AuthError && e.type === 'INSUFFICIENT_CREDENTIALS' ? extraFields(e.expected) : [];
      if (more.length) {
        // Password accepted, Guacamole wants the next factor.
        extra = more;
        extraValues = Object.fromEntries(more.map((field) => [field.name, '']));
        formError = t.login.moreNeeded;
      } else {
        extra = [];
        extraValues = {};
        formError = t.login.failed;
        password = '';
      }
    } finally {
      busy = false;
    }
  }
</script>

<main class="login g-grid-paper">
  <section class="card">
    <header>
      <img src={theme.logo} alt="" width="40" height="40" />
      <div>
        <div class="label">{t.login.title}</div>
        <h1>{config.title}</h1>
      </div>
    </header>

    {#if errorText}
      <p class="error" role="alert">{errorText}</p>
    {/if}

    {#if ssoUrl}
      <button class="btn" type="button" onclick={() => onSso(ssoUrl)}>{t.login.sso}</button>
    {/if}

    {#if passwordLogin}
      {#if ssoUrl}
        <div class="divider label">{t.login.or}</div>
      {/if}
      <form onsubmit={submit}>
        <label>
          <span class="label">{t.login.username}</span>
          <input bind:value={username} autocomplete="username" required />
        </label>
        <label>
          <span class="label">{t.login.password}</span>
          <input type="password" bind:value={password} autocomplete="current-password" required />
        </label>
        {#each extra as field (field.name)}
          {#if field.qrCode?.startsWith('data:image/')}
            <figure class="enroll">
              <img src={field.qrCode} alt="" width="180" height="180" />
              <figcaption>{t.login.enroll}</figcaption>
            </figure>
          {/if}
          <label>
            <span class="label">{fieldLabel(field)}</span>
            <!-- svelte-ignore a11y_autofocus (the next factor is the only thing left to type) -->
            <input
              bind:value={extraValues[field.name]}
              autocomplete="one-time-code"
              inputmode={field.type === 'GUAC_TOTP_CODE' ? 'numeric' : undefined}
              required
              autofocus
            />
          </label>
        {/each}
        {#if formError}
          <p class="error" role="alert">{formError}</p>
        {/if}
        <button class="btn" class:ghost={!!ssoUrl} type="submit" disabled={busy}>{t.login.submit}</button>
      </form>
    {/if}
  </section>
</main>

<style>
  .login {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 16px;
    overflow: auto;
  }

  .card {
    width: min(380px, 100%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 28px;
    border: 1px solid var(--g-border);
    background: var(--g-panel);
  }

  header {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  h1 {
    margin: 0;
    font-family: var(--g-heading);
    font-size: 24px;
    font-weight: 600;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  input {
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--g-border-strong);
    border-radius: var(--g-radius);
    background: var(--g-bg);
  }

  input:focus {
    outline: 2px solid var(--g-accent-text);
    outline-offset: -1px;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--g-border);
  }

  .enroll {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* A QR code needs its light quiet zone in every theme to stay scannable. */
  .enroll img {
    background: #fff;
    padding: 6px;
  }

  .enroll figcaption {
    color: var(--g-text-2);
    text-align: center;
  }

  .error {
    margin: 0;
    padding: 8px 10px;
    border-left: 3px solid var(--g-signal);
    background: var(--g-bg-2);
    color: var(--g-signal-text);
  }
</style>
