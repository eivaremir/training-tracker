<script lang="ts">
  // Swipeable exercise media: demonstration photos first, then the generated muscle map.
  // Uses native horizontal scroll-snap, so swiping feels right on touch devices.
  import BodyFigure from './BodyFigure.svelte';
  import Label from './Label.svelte';
  import { SHAPES, stateOf } from '../muscles';
  import type { Muscles } from '../types';

  let { images = [], muscles, name }: { images?: string[]; muscles: Muscles; name: string } = $props();

  let track: HTMLDivElement;
  let active = $state(0);
  let hover = $state<string | null>(null);
  const failed = $state<Record<string, boolean>>({});
  const photos = $derived(images.filter((u) => !failed[u]).slice(0, 2));
  const count = $derived(photos.length + 1);

  const fill = (id: string) => {
    const s = stateOf(id, muscles, 'advanced');
    return s === 'p' ? 'var(--text)' : s === 's' ? 'var(--mid)' : 'var(--surface-hihi)';
  };
  const onscroll = () => { active = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); };
  const go = (i: number) => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
</script>

<div class="carousel">
  <div class="track" bind:this={track} {onscroll} role="region" aria-label="{name} media, swipe for more">
    {#each photos as src, i (src)}
      <div class="slide">
        <img {src} alt="{name}, {i === 0 ? 'start' : 'finish'} position" loading="lazy" decoding="async" referrerpolicy="no-referrer"
          onerror={() => (failed[src] = true)} />
        <span class="tag"><Label size={8} color="#fff">{i === 0 ? 'Start' : 'Finish'}</Label></span>
      </div>
    {/each}
    <div class="slide map">
      <BodyFigure shapes={SHAPES.advanced.front} {fill} bind:hover maxWidth={110} />
      <BodyFigure shapes={SHAPES.advanced.back} {fill} bind:hover maxWidth={110} />
      <span class="tag muscles"><Label size={8}>Muscles</Label></span>
    </div>
  </div>
  {#if count > 1}
    <div class="dots">
      {#each Array(count) as _, i}
        <button class:on={active === i} onclick={() => go(i)} aria-label="Show slide {i + 1} of {count}"></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .carousel { position: relative; }
  .track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 12px 12px 0 0;
    aspect-ratio: 4 / 3; background: var(--surface-hi); overscroll-behavior-x: contain; }
  .track::-webkit-scrollbar { display: none; }
  .slide { position: relative; flex: 0 0 100%; scroll-snap-align: start; display: flex; align-items: center; justify-content: center; }
  .slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .map { gap: 6px; padding: 12px; background: var(--bg); }
  .map :global(.fig) { height: 100%; flex: 0 1 auto; }
  .map :global(svg) { height: 100%; width: auto; }
  .tag { position: absolute; left: 8px; top: 8px; padding: 3px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.55); }
  .tag.muscles { background: var(--surface-hi); border: 1px solid var(--border); }
  .dots { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; pointer-events: none; }
  .dots button { pointer-events: auto; width: 7px; height: 7px; padding: 0; border-radius: 4px; border: none; cursor: pointer;
    background: rgba(255, 255, 255, 0.5); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); }
  .dots button.on { background: #fff; width: 16px; }
</style>
