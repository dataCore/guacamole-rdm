<script lang="ts">
  import type { CredentialField } from '../lib/credentials';
  import { t } from '../lib/i18n';

  interface Props {
    title: string;
    fields: CredentialField[];
    onSubmit: (values: Record<string, string>) => void;
    onCancel: () => void;
  }

  let { title, fields, onSubmit, onCancel }: Props = $props();

  // Only for the life of this form: handed to the session and dropped.
  let values = $state<Record<string, string>>({});

  function label(field: CredentialField): string {
    return field.known ? t.session.credentials.fields[field.known] : field.name;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onSubmit({ ...values });
    values = {};
  }

  function focusFirst(form: HTMLFormElement): void {
    queueMicrotask(() => form.querySelector('input')?.focus());
  }
</script>

<form onsubmit={submit} {@attach focusFirst}>
  <div class="label">{title}</div>
  <h2>{t.session.credentials.title}</h2>
  <p class="hint">{t.session.credentials.hint}</p>
  {#each fields as field (field.name)}
    <label>
      <span class="label">{label(field)}</span>
      <input
        type={field.secret ? 'password' : 'text'}
        bind:value={values[field.name]}
        autocomplete={field.autocomplete}
        autocapitalize="off"
        spellcheck="false"
      />
    </label>
  {/each}
  <div class="actions">
    <button class="btn" type="submit">{t.session.credentials.submit}</button>
    <button class="btn ghost" type="button" onclick={onCancel}>{t.session.credentials.cancel}</button>
  </div>
</form>

<style>
  form {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px 22px;
    border: 1px solid var(--g-border);
    border-left: 3px solid var(--g-accent);
    background: var(--g-panel);
  }

  h2 {
    margin: 0;
    font-family: var(--g-heading);
    font-size: 17px;
    font-weight: 600;
  }

  .hint {
    margin: 0;
    color: var(--g-text-2);
    font-size: 13px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  input {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--g-border-strong);
    border-radius: var(--g-radius);
    background: var(--g-bg);
  }

  input:focus {
    outline: 2px solid var(--g-accent-text);
    outline-offset: -1px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
</style>
