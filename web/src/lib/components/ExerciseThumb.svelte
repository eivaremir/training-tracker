<script lang="ts">
  // Thumbnail for an exercise: generated muscle diagram when muscles are known, striped placeholder otherwise.
  import MuscleThumb from './MuscleThumb.svelte';
  import PhotoSquare from './PhotoSquare.svelte';
  import type { Muscles } from '../types';

  let { name = '', muscles, size = 48 }: { name?: string; muscles?: Muscles; size?: number } = $props();
</script>

{#if muscles && (muscles.primary.length || muscles.secondary.length)}
  <MuscleThumb {muscles} {size} />
{:else}
  <PhotoSquare {size} label={name.split(' ')[0].slice(0, 4).toUpperCase() || '—'} />
{/if}
