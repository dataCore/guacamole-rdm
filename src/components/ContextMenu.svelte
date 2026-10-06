<script lang="ts" module>
  export interface MenuItem {
    label: string;
    action: () => void;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    x: number;
    y: number;
    items: MenuItem[];
    onClose: () => void;
  }

  let { x, y, items, onClose }: Props = $props();
  let menu: HTMLDivElement;

  // Keep the menu inside the viewport.
  let left = $state(0);
  let top = $state(0);

  onMount(() => {
    const rect = menu.getBoundingClientRect();
    left = Math.min(x, window.innerWidth - rect.width - 4);
    top = Math.min(y, window.innerHeight - rect.height - 4);
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  });

  function run(item: MenuItem): void {
    onClose();
    item.action();
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      buttons[(next + buttons.length) % buttons.length]?.focus();
    }
  }
</script>

<svelte:window onpointerdown={(e) => !menu.contains(e.target as Node) && onClose()} onblur={onClose} />

<div class="menu" role="menu" tabindex="-1" bind:this={menu} style:left="{left}px" style:top="{top}px" onkeydown={keydown}>
  {#each items as item (item.label)}
    <button role="menuitem" disabled={item.disabled} onclick={() => run(item)}>{item.label}</button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    padding: 4px 0;
    border: 1px solid var(--g-border-strong);
    background: var(--g-panel);
  }

  button {
    display: block;
    width: 100%;
    padding: 6px 14px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--g-accent);
    color: var(--g-on-accent, var(--g-paper));
    outline: none;
  }

  button:disabled {
    color: var(--g-text-muted);
    cursor: default;
  }
</style>
