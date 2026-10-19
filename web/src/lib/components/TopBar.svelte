<script lang="ts">
  import type { Snippet } from 'svelte';
  import Label from './Label.svelte';
  let { title, subtitle, left, right }: { title: string; subtitle?: string; left?: Snippet; right?: Snippet } = $props();
</script>

<header>
  <div class="left">{@render left?.()}</div>
  <div class="mid">
    {#if subtitle}<Label size={9}>{subtitle}</Label>{/if}
    <div class="title">{title}</div>
  </div>
  <div class="right">{@render right?.()}</div>
</header>

<style>
  header { position: sticky; top: 0; z-index: 10; background: var(--bg); border-bottom: 1px solid var(--border);
    padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 12px; display: flex; align-items: center; gap: 12px; }
  .left { min-width: 32px; display: flex; align-items: center; }
  .mid { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title { font-family: var(--f-cond); font-weight: 600; font-size: 22px; color: var(--text); letter-spacing: 0.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { display: flex; align-items: center; gap: 8px; }
</style>
