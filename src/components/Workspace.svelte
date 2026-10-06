<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import Maximize from '@lucide/svelte/icons/maximize';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Unplug from '@lucide/svelte/icons/unplug';
  import X from '@lucide/svelte/icons/x';
  import { t } from '../lib/i18n';
  import { sessionStateLabel, type Session } from '../lib/session.svelte';
  import type { SessionManager } from '../lib/sessions.svelte';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import CredentialPrompt from './CredentialPrompt.svelte';
  import ProtocolIcon from './ProtocolIcon.svelte';

  let { manager }: { manager: SessionManager } = $props();

  let viewport: HTMLDivElement;
  let frame: HTMLElement;
  let keyboard: Guacamole.Keyboard | null = null;
  /** The session the keyboard currently types into. Lags behind
   *  manager.active on purpose: when the tab changes, the releases that
   *  keyboard.reset() emits must still reach the old target. */
  let typingTo: Session | null = null;
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let dragId: string | null = null;

  const active = $derived(manager.active);

  onMount(() => {
    // One keyboard for the viewport, routed to whichever tab is in front.
    // Bound to the viewport, not the document, so typing in the tree search
    // never reaches a remote machine.
    keyboard = new Guacamole.Keyboard(viewport);
    keyboard.onkeydown = (keysym) => {
      typingTo?.sendKey(true, keysym);
      return false;
    };
    keyboard.onkeyup = (keysym) => typingTo?.sendKey(false, keysym);
  });

  onDestroy(() => {
    keyboard?.reset();
    if (keyboard) keyboard.onkeydown = keyboard.onkeyup = null;
  });

  // Switching tabs: release held keys (no stuck Alt on the old target) and
  // give the new tab the keyboard.
  $effect(() => {
    const next = manager.active;
    keyboard?.reset(); // releases go to typingTo, still the old tab
    typingTo = next;
    // A pending credential prompt keeps the focus; the remote end has
    // nothing to type into yet.
    if (next && !next.required) queueMicrotask(() => viewport?.focus({ preventScroll: true }));
  });

  /** Local clipboard to the remote side when the user comes back to the
   *  session. Needs clipboard-read permission; silently skipped otherwise. */
  function syncClipboard(): void {
    const session = manager.active;
    if (!session || !navigator.clipboard?.readText) return;
    navigator.clipboard.readText().then(
      (text) => session.pushClipboard(text),
      () => undefined,
    );
  }

  function host(session: Session) {
    return (element: HTMLElement) => {
      session.attach(element);
      return () => session.detach();
    };
  }

  function tabMenu(session: Session, event: MouseEvent): void {
    event.preventDefault();
    menu = {
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: t.tabs.reconnect, action: () => session.connect() },
        { label: t.tabs.close, action: () => manager.close(session.id) },
        { label: t.tabs.closeOthers, action: () => manager.closeOthers(session.id), disabled: manager.sessions.length < 2 },
        { label: t.tabs.closeAll, action: () => manager.closeAll() },
      ],
    };
  }

  function drop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    if (dragId) manager.move(dragId, targetIndex);
    dragId = null;
  }

  function fullscreen(): void {
    frame.requestFullscreen?.().catch(() => undefined);
  }
</script>

<!-- Keys held while the focus leaves (Alt+Tab, a click into the tree) never
     send their key-up to the viewport; release them so no modifier stays
     pressed on the remote end. -->
<svelte:window onfocus={syncClipboard} onblur={() => keyboard?.reset()} />

<section class="workspace" bind:this={frame}>
  <div class="tabbar" role="tablist">
    {#each manager.sessions as session, index (session.id)}
      <div
        class="tab"
        class:active={session.id === manager.activeId}
        role="tab"
        tabindex="0"
        aria-selected={session.id === manager.activeId}
        title={session.remoteName ?? session.title}
        draggable="true"
        onclick={() => manager.activate(session.id)}
        onkeydown={(e) => e.key === 'Enter' && manager.activate(session.id)}
        onauxclick={(e) => e.button === 1 && manager.close(session.id)}
        oncontextmenu={(e) => tabMenu(session, e)}
        ondragstart={() => (dragId = session.id)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => drop(index, e)}
      >
        <span class="dot {session.state}"></span>
        <ProtocolIcon protocol={session.node.protocol} size={14} />
        <span class="tab-title">{session.title}</span>
        <button
          class="close"
          title={t.tabs.close}
          aria-label={t.tabs.close}
          onclick={(e) => {
            e.stopPropagation();
            manager.close(session.id);
          }}
        >
          <X size={13} />
        </button>
      </div>
    {/each}
    <span class="tab-fill"></span>
    {#if active}
      <div class="session-actions">
        <button class="icon-btn" title={t.tabs.ctrlAltDel} aria-label={t.tabs.ctrlAltDel} onclick={() => active.sendCtrlAltDel()} disabled={active.state !== 'connected'}>
          <Keyboard size={16} />
        </button>
        <button class="icon-btn" title={t.tabs.reconnect} aria-label={t.tabs.reconnect} onclick={() => active.connect()}>
          <RotateCcw size={16} />
        </button>
        <button class="icon-btn" title={t.tabs.disconnect} aria-label={t.tabs.disconnect} onclick={() => active.disconnect()} disabled={active.state === 'disconnected' || active.state === 'error'}>
          <Unplug size={16} />
        </button>
        <button class="icon-btn" title={t.tabs.fullscreen} aria-label={t.tabs.fullscreen} onclick={fullscreen}>
          <Maximize size={16} />
        </button>
      </div>
    {/if}
  </div>

  <div class="stage">
    <!-- The viewport takes the keyboard; Guacamole handles mouse and keys. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the remote desktop needs focus for the keyboard) -->
    <div role="application" class="viewport" class:g-grid-paper={!active} tabindex="0" bind:this={viewport} onfocus={syncClipboard} onfocusout={() => keyboard?.reset()} onpointerdown={() => viewport.focus({ preventScroll: true })}>
      {#each manager.sessions as session (session.id)}
        <div class="host" class:hidden={session.id !== manager.activeId} {@attach host(session)}>
          {#if session.state !== 'connected' && !session.required}
            <div class="overlay">
              <div class="overlay-box" class:error={session.state === 'error'}>
                <div class="label">{session.title}</div>
                <p>{sessionStateLabel(session)}</p>
                {#if session.state === 'error' || session.state === 'disconnected'}
                  <div class="overlay-actions">
                    <button class="btn" onclick={() => session.connect()}>{t.session.reconnect}</button>
                    <button class="btn ghost" onclick={() => manager.close(session.id)}>{t.session.close}</button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if !active}
        <div class="empty">
          <div class="label">{t.workspace.emptyTitle}</div>
          <p>{t.workspace.emptyHint}</p>
        </div>
      {/if}
    </div>

    <!-- Outside the viewport on purpose: its Guacamole.Keyboard listens in the
         capture phase and would swallow every key typed into the form. Only
         the tab in front asks; a background tab waits until it is shown. -->
    {#if active?.required}
      {#key active.id}
        <div class="overlay">
          <CredentialPrompt
            title={active.title}
            fields={active.required}
            onSubmit={(values) => active.submitCredentials(values)}
            onCancel={() => active.disconnect()}
          />
        </div>
      {/key}
    {/if}
  </div>
</section>

{#if menu}
  <ContextMenu {...menu} onClose={() => (menu = null)} />
{/if}

<style>
  .workspace {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--g-bg);
  }

  .tabbar {
    flex: none;
    display: flex;
    align-items: stretch;
    height: 34px;
    border-bottom: 1px solid var(--g-border);
    background: var(--g-bg-2);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .tab {
    flex: 0 1 220px;
    min-width: 110px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    border-right: 1px solid var(--g-border);
    border-top: 2px solid transparent;
    color: var(--g-text-2);
    font-family: var(--g-font-ui, var(--g-font-mono));
    font-size: 12.5px;
    cursor: default;
    user-select: none;
  }

  .tab:hover {
    background: var(--g-panel-2);
  }

  .tab.active {
    border-top-color: var(--g-accent);
    background: var(--g-panel);
    color: var(--g-text);
    margin-bottom: -1px;
  }

  .tab-title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    background: var(--g-text-muted);
  }

  .dot.connected {
    background: var(--g-success-text);
  }

  .dot.connecting,
  .dot.waiting {
    background: var(--g-warning-text);
  }

  .dot.error {
    background: var(--g-signal-text);
  }

  .close {
    flex: none;
    display: inline-flex;
    padding: 3px;
    border: 0;
    background: transparent;
    color: var(--g-text-muted);
    cursor: pointer;
  }

  .close:hover {
    background: var(--g-signal);
    color: var(--g-on-accent, var(--g-paper));
  }

  .tab-fill {
    flex: 1;
  }

  .session-actions {
    flex: none;
    position: sticky;
    right: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    border-left: 1px solid var(--g-border);
    background: var(--g-bg-2);
  }

  .stage {
    flex: 1;
    position: relative;
    display: flex;
    min-height: 0;
  }

  .viewport {
    flex: 1;
    position: relative;
    min-height: 0;
    outline: none;
  }

  .host {
    position: absolute;
    inset: 0;
    /* A remote desktop's own colour, not a theme colour. */
    background: #000;
  }

  .host.hidden {
    display: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 16px;
  }

  .overlay-box {
    max-width: 420px;
    padding: 18px 22px;
    border: 1px solid var(--g-border);
    border-left: 3px solid var(--g-warning-text);
    background: var(--g-panel);
  }

  .overlay-box.error {
    border-left-color: var(--g-signal);
  }

  .overlay-box p {
    margin: 6px 0 0;
  }

  .overlay-actions {
    display: flex;
    gap: 8px;
    margin-top: 14px;
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    color: var(--g-text-2);
  }

  .empty p {
    margin: 6px 0 0;
    font-family: var(--g-font-ui, var(--g-font-mono));
  }

  .workspace:fullscreen .tabbar {
    display: none;
  }
</style>
