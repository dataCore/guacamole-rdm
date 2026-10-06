<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Folder from '@lucide/svelte/icons/folder';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import { t } from '../lib/i18n';
  import type { ConnectionNode, TreeNode } from '../lib/tree';
  import ProtocolIcon from './ProtocolIcon.svelte';
  import Self from './TreeItem.svelte';

  interface Props {
    node: TreeNode;
    depth: number;
    expanded: ReadonlySet<string>;
    selectedKey: string | null;
    openCount: (key: string) => number;
    onToggle: (key: string) => void;
    onSelect: (node: TreeNode) => void;
    onOpen: (node: ConnectionNode, forceNew: boolean) => void;
    onMenu: (node: ConnectionNode, event: MouseEvent) => void;
  }

  let { node, depth, expanded, selectedKey, openCount, onToggle, onSelect, onOpen, onMenu }: Props = $props();

  const isOpen = $derived(node.kind === 'folder' && expanded.has(node.key));
  const tabs = $derived(node.kind === 'connection' ? openCount(node.key) : 0);
</script>

<li role="treeitem" aria-selected={selectedKey === node.key} aria-expanded={node.kind === 'folder' ? isOpen : undefined}>
  <!-- svelte-ignore a11y_click_events_have_key_events (keyboard handled by the tree) -->
  <div
    class="row"
    class:selected={selectedKey === node.key}
    data-key={node.key}
    style:padding-left="{6 + depth * 16}px"
    onclick={() => {
      onSelect(node);
      if (node.kind === 'folder') onToggle(node.key);
    }}
    ondblclick={() => node.kind === 'connection' && onOpen(node, false)}
    onauxclick={(e) => e.button === 1 && node.kind === 'connection' && onOpen(node, true)}
    oncontextmenu={(e) => {
      if (node.kind !== 'connection') return;
      e.preventDefault();
      onSelect(node);
      onMenu(node, e);
    }}
    role="presentation"
  >
    {#if node.kind === 'folder'}
      <span class="chevron" class:open={isOpen}><ChevronRight size={14} /></span>
      <span class="icon folder">
        {#if isOpen}<FolderOpen size={15} />{:else}<Folder size={15} />{/if}
      </span>
      <span class="name">{node.name}</span>
    {:else}
      <span class="chevron"></span>
      <span class="icon"><ProtocolIcon protocol={node.protocol} /></span>
      <span class="name" class:has-tab={tabs > 0}>{node.name}</span>
      {#if node.activeConnections > 0}
        <span class="active" title={t.tree.active(node.activeConnections)}></span>
      {/if}
    {/if}
  </div>

  {#if node.kind === 'folder' && isOpen}
    <ul role="group">
      {#each node.children as child (child.key)}
        <Self node={child} depth={depth + 1} {expanded} {selectedKey} {openCount} {onToggle} {onSelect} {onOpen} {onMenu} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  li {
    list-style: none;
  }

  ul {
    margin: 0;
    padding: 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding-right: 8px;
    white-space: nowrap;
    cursor: default;
    user-select: none;
  }

  .row:hover {
    background: var(--g-panel-2);
  }

  .row.selected {
    background: var(--g-selection-bg, var(--g-accent));
    color: var(--g-selection-text, var(--g-on-accent, var(--g-paper)));
  }

  .row.selected .icon,
  .row.selected .chevron {
    color: inherit;
  }

  .chevron {
    flex: none;
    width: 14px;
    display: inline-flex;
    color: var(--g-text-muted);
    transition: transform 0.12s;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .icon {
    flex: none;
    display: inline-flex;
    color: var(--g-accent-text);
  }

  .icon.folder {
    color: var(--g-text-label);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Bold like RDM: this connection has an open tab here. */
  .name.has-tab {
    font-weight: 600;
  }

  .active {
    flex: none;
    width: 7px;
    height: 7px;
    margin-left: auto;
    background: var(--g-success-text);
  }
</style>
