<script lang="ts">
  // Log sets for an exercise outside of a plan.
  import Button from './Button.svelte';
  import NumField from './NumField.svelte';
  import BigNum from './BigNum.svelte';
  import Label from './Label.svelte';
  import BodyweightPresets from './BodyweightPresets.svelte';
  import MediaCarousel from './MediaCarousel.svelte';
  import type { Exercise } from '../types';
  import { unit, toUnit, toKg, keepOrConvert, liftStep, fmtWeight } from '../units';

  let { exercise, previous, onadd }: {
    exercise: Exercise;
    /** Most recent logged set for this exercise, used as the starting point. */
    previous?: { reps: number; weight: number };
    onadd: (sets: { reps: number; weight: number }[]) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let reps = $state(previous?.reps ?? 10);
  // svelte-ignore state_referenced_locally
  let weight = $state(toUnit(previous?.weight ?? 20));
  let count = $state(3);
</script>

<div class="wrap">
  <div class="name cond">{exercise.name}</div>
  <div class="media"><MediaCarousel images={(exercise.images ?? []).filter((u) => u.startsWith('https://'))} muscles={exercise.muscles} name={exercise.name} /></div>
  {#if previous}<Label size={9} color="var(--text-low)">Last time: {previous.reps} × {fmtWeight(previous.weight)}</Label>{/if}
  <div class="row" style="gap:8px">
    <NumField label="Reps" bind:value={reps} suffix="reps" />
    <NumField label="Weight" bind:value={weight} suffix={unit()} step={liftStep()} />
  </div>
  <BodyweightPresets equipment={exercise.equipment} bind:value={weight} />
  <NumField label="Sets" bind:value={count} suffix="sets" />
  <div class="preview">
    <BigNum size={22}>{Math.max(1, Math.min(20, Math.round(count)))}</BigNum><Label> sets of </Label>
    <BigNum size={22}>{reps}</BigNum><Label> × </Label><BigNum size={22}>{weight}</BigNum><Label> {unit()}</Label>
  </div>
  <Button full size="lg" icon="plus" disabled={reps < 1}
    onclick={() => onadd(Array.from({ length: Math.max(1, Math.min(20, Math.round(count))) }, () => ({ reps, weight: previous ? keepOrConvert(previous.weight, weight) : toKg(weight) })))}>Log sets</Button>
</div>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .name { font-size: 20px; }
  .media { width: 100%; max-width: 400px; align-self: center; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .preview { display: flex; align-items: baseline; gap: 4px; padding: 10px 12px; border: 1px dashed var(--border-hi); border-radius: 10px; }
</style>
