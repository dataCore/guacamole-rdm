<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Moon from '@lucide/svelte/icons/moon';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import Settings from '@lucide/svelte/icons/settings';
  import Sun from '@lucide/svelte/icons/sun';
  import { SessionExpiredError, type AuthResult, type GuacamoleApi } from '../lib/api';
  import type { RdmConfig } from '../lib/config';
  import { locale, setLanguage, t } from '../lib/i18n';
  import { loadPref, savePref } from '../lib/prefs';
  import { SessionManager } from '../lib/sessions.svelte';
  import { theme } from '../lib/theme.svelte';
  import { buildTree, mergeDataSources, type TreeNode } from '../lib/tree';
  import Sidebar from './Sidebar.svelte';
  import Workspace from './Workspace.svelte';

  interface Props {
    config: RdmConfig;
    api: GuacamoleApi;
    user: AuthResult;
    onLogout: () => Promise<void>;
    verifyAuth: () => Promise<void>;
  }

  let { config, api, user, onLogout, verifyAuth }: Props = $props();

  /** Refresh interval for the tree: keeps "active sessions" counts current
   *  and the Guacamole token alive while the page is open. */
  const REFRESH_MS = 30_000;

  // The context is fixed for the life of the shell: the shell is re-created
  // on every login, together with api and verifyAuth.
  const manager = new SessionManager({
    get base() {
      return api.base;
    },
    token: () => api.token,
    verifyAuth: () => void verifyAuth(),
  });

  let nodes = $state<TreeNode[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let sidebarOpen = $state(loadPref('sidebarOpen', true));
  let sidebarWidth = $state(loadPref('sidebarWidth', 280));
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refresh(): Promise<void> {
    // Each data source on its own: one broken source must not hide the
    // connections of the others.
    const results = await Promise.allSettled(
      user.availableDataSources.map(async (dataSource) => ({
        dataSource,
        nodes: buildTree(dataSource, await api.getTree(dataSource)),
      })),
    );
    loading = false;
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.some((result) => result.reason instanceof SessionExpiredError)) {
      await verifyAuth();
      return;
    }
    const trees = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (trees.length) nodes = mergeDataSources(trees);
    loadError = !failures.length ? null : trees.length ? t.tree.partial : t.tree.loadFailed;
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
    savePref('sidebarOpen', sidebarOpen);
  }

  function startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const move = (e: PointerEvent) => {
      sidebarWidth = Math.max(180, Math.min(600, startWidth + e.clientX - startX));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      savePref('sidebarWidth', sidebarWidth);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  function beforeUnload(event: BeforeUnloadEvent): void {
    if (manager.sessions.length) event.preventDefault();
  }

  async function logout(): Promise<void> {
    manager.closeAll();
    await onLogout();
  }

  onMount(() => {
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
  });

  onDestroy(() => {
    clearInterval(timer);
    manager.closeAll();
  });
</script>

<svelte:window onbeforeunload={beforeUnload} />

<div class="shell">
  <header class="masthead">
    <button class="icon-btn" title={t.header.toggleTree} aria-label={t.header.toggleTree} onclick={toggleSidebar}>
      {#if sidebarOpen}<PanelLeftClose size={18} />{:else}<PanelLeftOpen size={18} />{/if}
    </button>
    <img class="logo" src={theme.logo} alt="" width="26" height="26" />
    <span class="title">{config.title}</span>
    <span class="spacer"></span>
    <span class="user label">{user.username}</span>
    <a class="icon-btn" href={api.base.toString()} target="_blank" rel="noopener" title={t.header.guacamole} aria-label={t.header.guacamole}>
      <ExternalLink size={17} />
    </a>
    <button
      class="icon-btn lang"
      title={t.header.language}
      aria-label={t.header.language}
      onclick={() => setLanguage(locale.lang === 'de' ? 'en' : 'de')}
    >
      {locale.lang === 'de' ? 'EN' : 'DE'}
    </button>
    <button class="icon-btn" title={t.header.theme} aria-label={t.header.theme} onclick={() => theme.toggle()}>
      {#if theme.mode === 'dark'}<Sun size={17} />{:else}<Moon size={17} />{/if}
    </button>
    <!-- New tab: leaving this page would drop every open session. -->
    <a
      class="icon-btn"
      href={new URL('#/settings/sessions', api.base).toString()}
      target="_blank"
      rel="noopener"
      title={t.header.settings}
      aria-label={t.header.settings}
    >
      <Settings size={17} />
    </a>
    <button class="icon-btn" title={t.header.logout} aria-label={t.header.logout} onclick={logout}>
      <LogOut size={17} />
    </button>
  </header>

  <div class="body">
    {#if sidebarOpen}
      <aside class="sidebar" style:width="{sidebarWidth}px">
        <Sidebar
          {nodes}
          {loading}
          error={loadError}
          openCount={(key) => manager.openCount(key)}
          onOpen={(node, forceNew) => manager.open(node, forceNew)}
          onRefresh={refresh}
        />
      </aside>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resizer" onpointerdown={startResize}></div>
    {/if}
    <Workspace {manager} />
  </div>
</div>

<style>
  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .masthead {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    padding: 0 8px;
    border-bottom: 1px solid var(--g-border);
    background-color: var(--g-bg-2);
    background-image:
      linear-gradient(var(--g-grid-tint) 1px, transparent 1px),
      linear-gradient(90deg, var(--g-grid-tint) 1px, transparent 1px);
    background-size: var(--g-grid-size) var(--g-grid-size);
  }

  .logo {
    margin-left: 4px;
  }

  .title {
    font-family: var(--g-heading);
    font-weight: 600;
    font-size: 17px;
  }

  .spacer {
    flex: 1;
  }

  .user {
    margin-right: 6px;
  }

  .lang {
    font-family: var(--g-font-ui, var(--g-font-mono));
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .sidebar {
    flex: none;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--g-bg-2);
  }

  .resizer {
    flex: none;
    width: 5px;
    margin-left: -2px;
    margin-right: -3px;
    position: relative;
    z-index: 2;
    cursor: col-resize;
    border-left: 1px solid var(--g-border);
  }

  .resizer:hover {
    border-left-color: var(--g-accent-text);
  }

  @media (max-width: 640px) {
    .user {
      display: none;
    }
  }
</style>
