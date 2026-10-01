<script lang="ts">
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import NumField from './NumField.svelte';
  import Button from './Button.svelte';
  import BodyweightPresets from './BodyweightPresets.svelte';
  import type { SetGoal } from '../types';
  import { unit, toUnit, keepOrConvert, liftStep, meetsGoal, fmtWeight } from '../units';

  let { goal, equipment, onsave, onskip }: { goal: SetGoal; equipment?: string[]; onsave: (a: { reps: number; weight: number }) => void; onskip: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let reps = $state(goal.reps);
  // svelte-ignore state_referenced_locally
  let weight = $state(toUnit(goal.weight));
</script>

<div class="wrap">
  <div class="goal">
    <Label>Goal</Label>
    <div>
      <BigNum size={22}>{goal.reps}</BigNum><span class="x">×</span><BigNum size={22}>{toUnit(goal.weight)}</BigNum><Label size={9}> {unit()}</Label>
    </div>
  </div>
  <div class="row">
    <NumField label="Reps" bind:value={reps} suffix="reps" />
    <NumField label="Weight" bind:value={weight} suffix={unit()} step={liftStep()} />
  </div>
  <BodyweightPresets {equipment} bind:value={weight} />
  <div class="row">
    <Button variant="secondary" full onclick={onskip}>Skip set</Button>
    <Button full onclick={() => onsave({ reps, weight: keepOrConvert(goal.weight, weight) })}>Save</Button>
  </div>
</div>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 18px; }
  .goal { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
  .x { color: var(--text-low); padding: 0 4px; }
</style>
