<script lang="ts">
  import Label from './Label.svelte';
  import { SILHOUETTE, type Shape } from '../muscles';

  let { shapes, label, fill, ontap, hover = $bindable(null), maxWidth = 170 }: {
    shapes: Shape[]; label?: string; maxWidth?: number; fill: (id: string) => string; ontap?: (id: string) => void; hover?: string | null;
  } = $props();
</script>

{#snippet part(s: Shape)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <path d={s.d} fill={fill(s.id)} stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round"
    style:cursor={ontap ? 'pointer' : 'default'} style:transition="fill 0.12s"
    style:opacity={hover && hover !== s.id && !ontap ? 0.55 : 1}
    onclick={() => ontap?.(s.id)} onmouseenter={() => (hover = s.id)} onmouseleave={() => (hover = null)} />
{/snippet}

<div class="fig">
  <svg viewBox="30 4 140 366" style:max-width="{maxWidth}px">
    <g fill="var(--surface-hi)" stroke="var(--border)" stroke-width="1">
      {#each SILHOUETTE as d}<path {d} />{/each}
      <g transform="translate(200,0) scale(-1,1)">{#each SILHOUETTE.slice(2) as d}<path {d} />{/each}</g>
    </g>
    {#each shapes as s (s.id)}{@render part(s)}{/each}
    <g transform="translate(200,0) scale(-1,1)">{#each shapes as s (s.id)}{@render part(s)}{/each}</g>
  </svg>
  {#if label}<Label size={9} color="var(--text-low)">{label}</Label>{/if}
</div>

<style>
  .fig { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  svg { width: 100%; display: block; }
</style>
