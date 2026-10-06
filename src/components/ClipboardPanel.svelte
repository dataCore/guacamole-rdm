<script lang="ts">
  import { t } from '../lib/i18n';
  import type { Session } from '../lib/session.svelte';

  let { session, onClose }: { session: Session; onClose: () => void } = $props();

  // Starts with what was last exchanged; edits stay local until sent.
  // svelte-ignore state_referenced_locally (a snapshot is the point)
  let text = $state(session.clipboard);

  function send(event: SubmitEvent): void {
    event.preventDefault();
    session.sendClipboard(text);
    onClose();
  }

  function focusField(form: HTMLFormElement): void {
    queueMicrotask(() => form.querySelector('textarea')?.select());
  }
</script>

<form onsubmit={send} {@attach focusField}>
  <div class="label">{t.tabs.clipboard} · {session.title}</div>
  <p class="hint">{t.clipboard.hint}</p>
  <textarea bind:value={text} rows="6" spellcheck="false" onkeydown={(e) => e.key === 'Escape' && onClose()}></textarea>
  <div class="actions">
    <button class="btn" type="submit" disabled={session.state !== 'connected'}>{t.clipboard.send}</button>
    <button class="btn ghost" type="button" onclick={onClose}>{t.clipboard.close}</button>
  </div>
</form>

<style>
  form {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 20;
    width: min(380px, calc(100% - 16px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--g-border-strong);
    background: var(--g-panel);
  }

  .hint {
    margin: 0;
    color: var(--g-text-2);
    font-size: 12.5px;
  }

  textarea {
    resize: vertical;
    min-height: 90px;
    padding: 8px 10px;
    border: 1px solid var(--g-border-strong);
    border-radius: var(--g-radius);
    background: var(--g-bg);
    font-family: var(--g-font-mono);
    font-size: 12.5px;
  }

  textarea:focus {
    outline: 2px solid var(--g-accent-text);
    outline-offset: -1px;
  }

  .actions {
    display: flex;
    gap: 8px;
  }
</style>
