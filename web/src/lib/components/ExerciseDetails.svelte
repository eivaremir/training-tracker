<script lang="ts">
  // Exercise detail sheet body: Guide (last session + how-to) and Stats tabs. Used by Library and Today.
  import type { Snippet } from 'svelte';
  import ExerciseGuide from './ExerciseGuide.svelte';
  import ExerciseStats from './ExerciseStats.svelte';
  import LastSets from './LastSets.svelte';
  import type { Exercise } from '../types';

  let { exercise, tab = $bindable('guide'), excludeSessionId, footer }: {
    exercise: Exercise; tab?: 'guide' | 'stats';
    /** Leave this session out of "last session" (the one being logged right now). */ excludeSessionId?: string;
    /** Extra content under the guide. */ footer?: Snippet;
  } = $props();
</script>

<div class="seg-tabs" style="padding-top:12px">
  <button class:on={tab === 'guide'} onclick={() => (tab = 'guide')}>Guide</button>
  <button class:on={tab === 'stats'} onclick={() => (tab = 'stats')}>Stats</button>
</div>
{#if tab === 'guide'}
  <div class="guide">
    <LastSets exerciseId={exercise.id} {excludeSessionId} />
    <ExerciseGuide muscles={exercise.muscles} equipment={exercise.equipment} instructions={exercise.instructions} images={exercise.images}
      level={exercise.level} category={exercise.category} />
    {@render footer?.()}
  </div>
{:else}
  <ExerciseStats exerciseId={exercise.id} />
{/if}

<style>
  .guide { padding: 16px 18px 24px; display: flex; flex-direction: column; gap: 16px; }
</style>
