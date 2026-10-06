<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Search from '@lucide/svelte/icons/search';
  import { t } from '../lib/i18n';
  import { loadPref, savePref } from '../lib/prefs';
  import { filterTree, folderKeys, visibleRows, type ConnectionNode, type TreeNode } from '../lib/tree';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import TreeItem from './TreeItem.svelte';

  interface Props {
    nodes: TreeNode[];
    loading: boolean;
    error: string | null;
    openCount: (key: string) => number;
    onOpen: (node: ConnectionNode, forceNew: boolean) => void;
    onRefresh: () => Promise<void>;
  }

  let { nodes, loading, error, openCount, onOpen, onRefresh }: Props = $props();

  let query = $state('');
  let selectedKey = $state<string | null>(null);
  let refreshing = $state(false);
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let treeElement: HTMLUListElement;

  const expanded = new SvelteSet<string>(loadPref<string[]>('expanded', []));
  const filtered = $derived(filterTree(nodes, query));
  // While searching, every folder on the way to a hit is open.
  const effectiveExpanded = $derived<ReadonlySet<string>>(query.trim() ? new Set(folderKeys(filtered)) : expanded);

  function persist(): void {
    savePref('expanded', [...expanded]);
  }

  function toggle(key: string): void {
    if (query.trim()) return;
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    persist();
  }

  function expandAll(open: boolean): void {
    expanded.clear();
    if (open) for (const key of folderKeys(nodes)) expanded.add(key);
    persist();
  }

  async function refresh(): Promise<void> {
    refreshing = true;
    await onRefresh();
    refreshing = false;
  }

  function showMenu(node: ConnectionNode, event: MouseEvent): void {
    menu = {
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: t.tree.open, action: () => onOpen(node, false) },
        { label: t.tree.openNew, action: () => onOpen(node, true) },
      ],
    };
  }

  function select(node: TreeNode): void {
    selectedKey = node.key;
  }

  /** Arrow keys walk the visible rows, like a file manager tree. */
  function keydown(event: KeyboardEvent): void {
    const rows = visibleRows(filtered, effectiveExpanded);
    if (!rows.length) return;
    const index = rows.findIndex((row) => row.key === selectedKey);
    const current = rows[index];
    let next: TreeNode | undefined;

    switch (event.key) {
      case 'ArrowDown':
        next = rows[Math.min(index + 1, rows.length - 1)] ?? rows[0];
        break;
      case 'ArrowUp':
        next = rows[Math.max(index - 1, 0)];
        break;
      case 'ArrowRight':
        if (current?.kind === 'folder' && !effectiveExpanded.has(current.key)) toggle(current.key);
        break;
      case 'ArrowLeft':
        if (current?.kind === 'folder' && effectiveExpanded.has(current.key)) toggle(current.key);
        break;
      case 'Enter':
        if (current?.kind === 'connection') onOpen(current, event.ctrlKey || event.metaKey);
        else if (current) toggle(current.key);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) {
      selectedKey = next.key;
      treeElement.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function searchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') query = '';
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      treeElement.focus();
      const first = visibleRows(filtered, effectiveExpanded).find((row) => row.kind === 'connection');
      if (first) selectedKey = first.key;
    }
    if (event.key === 'Enter') {
      const hits = visibleRows(filtered, effectiveExpanded).filter((row) => row.kind === 'connection');
      if (hits.length === 1) onOpen(hits[0] as ConnectionNode, false);
    }
  }
</script>

<div class="toolbar">
  <label class="search">
    <Search size={14} />
    <input type="search" placeholder={t.tree.search} aria-label={t.tree.search} bind:value={query} onkeydown={searchKeydown} />
  </label>
</div>
<div class="actions">
  <button class="icon-btn" title={t.tree.expandAll} aria-label={t.tree.expandAll} onclick={() => expandAll(true)}>
    <ChevronsUpDown size={15} />
  </button>
  <button class="icon-btn" title={t.tree.collapseAll} aria-label={t.tree.collapseAll} onclick={() => expandAll(false)}>
    <ChevronsDownUp size={15} />
  </button>
  <span class="spacer"></span>
  <button class="icon-btn" class:spin={refreshing} title={t.tree.refresh} aria-label={t.tree.refresh} onclick={refresh}>
    <RefreshCw size={15} />
  </button>
</div>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a tree is a single tab stop) -->
<ul class="tree" role="tree" tabindex="0" bind:this={treeElement} onkeydown={keydown}>
  {#each filtered as node (node.key)}
    <TreeItem
      {node}
      depth={0}
      expanded={effectiveExpanded}
      {selectedKey}
      {openCount}
      onToggle={toggle}
      onSelect={select}
      {onOpen}
      onMenu={showMenu}
    />
  {/each}
</ul>

{#if !loading && error}
  <p class="note error">{error}</p>
{:else if !loading && !nodes.length}
  <p class="note">{t.tree.empty}</p>
{:else if !loading && !filtered.length}
  <p class="note">{t.tree.noMatch}</p>
{/if}

{#if menu}
  <ContextMenu {...menu} onClose={() => (menu = null)} />
{/if}

<style>
  .toolbar {
    padding: 8px 8px 4px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--g-border);
    background: var(--g-panel);
    color: var(--g-text-muted);
  }

  .search:focus-within {
    border-color: var(--g-accent-text);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--g-text);
  }

  .actions {
    display: flex;
    align-items: center;
    padding: 0 6px 4px;
    border-bottom: 1px solid var(--g-border);
  }

  .spacer {
    flex: 1;
  }

  .spin :global(svg) {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tree {
    flex: 1;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    outline: none;
  }

  .tree:focus-visible {
    box-shadow: inset 0 0 0 2px var(--g-accent-text);
  }

  .note {
    margin: 0;
    padding: 12px;
    color: var(--g-text-muted);
  }

  .note.error {
    color: var(--g-signal-text);
  }
</style>
