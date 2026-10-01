<script lang="ts">
  // Exercise thumbnail: the first demonstration photo, else the generated muscle map, else a placeholder.
  // With `zoom`, tapping it opens the photo carousel (and the steps) in a sheet.
  import MuscleThumb from './MuscleThumb.svelte';
  import PhotoSquare from './PhotoSquare.svelte';
  import Sheet from './Sheet.svelte';
  import MediaCarousel from './MediaCarousel.svelte';
  import Label from './Label.svelte';
  import { MUSCLES } from '../muscles';
  import type { Muscles } from '../types';

  let { name = '', muscles, images = [], instructions = [], size = 48, zoom = false }: {
    name?: string; muscles?: Muscles; images?: string[]; instructions?: string[]; size?: number; zoom?: boolean;
  } = $props();

  let failed = $state(false);
  let open = $state(false);
  const photo = $derived(!failed ? images.find((u) => u.startsWith('https://')) : undefined);
  const hasMap = $derived(!!muscles && (muscles.primary.length > 0 || muscles.secondary.length > 0));
  const canZoom = $derived(zoom && !!muscles && (!!photo || hasMap));
  const photos = $derived(images.filter((u) => u.startsWith('https://')));
</script>

{#snippet thumb()}
  {#if photo}
    <img src={photo} alt={name} loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (failed = true)}
      style:width="{size}px" style:height="{size}px" />
  {:else if hasMap}
    <MuscleThumb muscles={muscles!} {size} />
  {:else}
    <PhotoSquare {size} label={name.split(' ')[0].slice(0, 4).toUpperCase() || '—'} />
  {/if}
{/snippet}

{#if canZoom}
  <button class="zoom" onclick={(e) => { e.stopPropagation(); open = true; }} aria-label="Show {name} photos">{@render thumb()}</button>
  <Sheet {open} onclose={() => (open = false)} title={name} height="90vh">
    <div class="view">
      <div class="media"><MediaCarousel images={photos} muscles={muscles!} {name} /></div>
      <div class="muscles">
        {#if muscles!.primary.length}<Label size={9}>Primary · {muscles!.primary.map((m) => MUSCLES[m] ?? m).join(' · ')}</Label>{/if}
        {#if muscles!.secondary.length}<Label size={9} color="var(--text-low)">Secondary · {muscles!.secondary.map((m) => MUSCLES[m] ?? m).join(' · ')}</Label>{/if}
      </div>
      {#if instructions.length}
        <ol>{#each instructions as step, i (i)}<li>{step}</li>{/each}</ol>
      {/if}
    </div>
  </Sheet>
{:else}
  {@render thumb()}
{/if}

<style>
  img { flex-shrink: 0; border-radius: 8px; object-fit: cover; border: 1px solid var(--border); background: var(--surface-hi); display: block; }
  .zoom { flex-shrink: 0; padding: 0; border: none; background: none; cursor: zoom-in; border-radius: 8px; display: block; }
  .view { padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 12px; }
  .media { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .muscles { display: flex; flex-direction: column; gap: 4px; }
  ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: var(--text-mid);
    font-family: var(--f-sans); font-size: 13px; line-height: 1.5; }
</style>
