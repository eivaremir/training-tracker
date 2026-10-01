<script lang="ts">
  // Log sets for an exercise outside of a plan.
  import Button from './Button.svelte';
  import NumField from './NumField.svelte';
  import BigNum from './BigNum.svelte';
  import Label from './Label.svelte';
  import type { Exercise } from '../types';

  let { exercise, previous, onadd }: {
    exercise: Exercise;
    /** Most recent logged set for this exercise, used as the starting point. */
    previous?: { reps: number; weight: number };
    onadd: (sets: { reps: number; weight: number }[]) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let reps = $state(previous?.reps ?? 10);
  // svelte-ignore state_referenced_locally
  let weight = $state(previous?.weight ?? 20);
  let count = $state(3);
</script>

<div class="wrap">
  <div class="name cond">{exercise.name}</div>
  {#if previous}<Label size={9} color="var(--text-low)">Last time: {previous.reps} × {previous.weight} kg</Label>{/if}
  <div class="row" style="gap:8px">
    <NumField label="Reps" bind:value={reps} suffix="reps" />
    <NumField label="Weight" bind:value={weight} suffix="kg" step={2.5} />
  </div>
  <NumField label="Sets" bind:value={count} suffix="sets" />
  <div class="preview">
    <BigNum size={22}>{Math.max(1, Math.min(20, Math.round(count)))}</BigNum><Label> sets of </Label>
    <BigNum size={22}>{reps}</BigNum><Label> × </Label><BigNum size={22}>{weight}</BigNum><Label> kg</Label>
  </div>
  <Button full size="lg" icon="plus" disabled={reps < 1}
    onclick={() => onadd(Array.from({ length: Math.max(1, Math.min(20, Math.round(count))) }, () => ({ reps, weight })))}>Log sets</Button>
</div>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .name { font-size: 20px; }
  .preview { display: flex; align-items: baseline; gap: 4px; padding: 10px 12px; border: 1px dashed var(--border-hi); border-radius: 10px; }
</style>
