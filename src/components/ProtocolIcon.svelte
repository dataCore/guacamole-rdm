<script lang="ts">
  import Monitor from '@lucide/svelte/icons/monitor';
  import Network from '@lucide/svelte/icons/network';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';

  let { protocol, size = 15 }: { protocol: string; size?: number } = $props();
</script>

{#if protocol === 'ssh' || protocol === 'telnet' || protocol === 'kubernetes'}
  <SquareTerminal {size} />
{:else if protocol === 'balancing'}
  <Network {size} />
{:else}
  <Monitor {size} />
{/if}
