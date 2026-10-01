<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, color = 'var(--text-mid)', size = 10 }: { children: Snippet; color?: string; size?: number } = $props();
</script>

<span style="font-family:var(--f-mono);font-size:{Math.max(11, size + 2)}px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:{color}">{@render children()}</span>
