<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children, size = 48, color = 'var(--text)', weight = 700 }: { children: Snippet; size?: number; color?: string; weight?: number } = $props();
</script>

<span style="font-family:var(--f-cond);font-weight:{weight};font-size:{size}px;line-height:0.9;color:{color};letter-spacing:-0.5px;font-variant-numeric:tabular-nums">{@render children()}</span>
