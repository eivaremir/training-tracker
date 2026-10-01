<script lang="ts">
  // Generated exercise picture: front + back body with primary (solid) and secondary (grey) muscles.
  import BodyFigure from './BodyFigure.svelte';
  import { SHAPES, stateOf } from '../muscles';
  import type { Muscles } from '../types';

  let { muscles, size = 48, radius = 8 }: { muscles: Muscles; size?: number; radius?: number } = $props();

  const fill = (id: string) => {
    const s = stateOf(id, muscles, 'advanced');
    return s === 'p' ? 'var(--text)' : s === 's' ? 'var(--mid)' : 'var(--surface-hihi)';
  };
  let hover = $state<string | null>(null);
</script>

<div class="thumb" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px" aria-hidden="true">
  <BodyFigure shapes={SHAPES.advanced.front} {fill} bind:hover maxWidth={size} />
  <BodyFigure shapes={SHAPES.advanced.back} {fill} bind:hover maxWidth={size} />
</div>

<style>
  .thumb { flex-shrink: 0; display: flex; gap: 1px; padding: 3px 5px; background: var(--bg); border: 1px solid var(--border);
    overflow: hidden; pointer-events: none; }
  .thumb :global(.fig) { height: 100%; flex: 1; }
  .thumb :global(svg) { height: 100%; width: auto; }
</style>
