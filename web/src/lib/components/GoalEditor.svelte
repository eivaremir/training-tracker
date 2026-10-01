<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import NumField from './NumField.svelte';
  import Button from './Button.svelte';
  import BodyweightPresets from './BodyweightPresets.svelte';
  import type { SetGoal } from '../types';
  import { unit, toUnit, keepOrConvert, liftStep, toKg as toKgSafe } from '../units';

  let { goals: initial, equipment, onsave, oncancel }: { goals: SetGoal[]; equipment?: string[]; onsave: (g: SetGoal[]) => void; oncancel: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const original = structuredClone($state.snapshot(initial));
  // Edited in the display unit; converted back to kg on save.
  // svelte-ignore state_referenced_locally
  let goals = $state<SetGoal[]>(original.map((g) => ({ ...g, weight: toUnit(g.weight) })));

  const addSet = () => goals.push({ ...(goals[goals.length - 1] || { reps: 8, weight: 20, restSeconds: 90 }) });
  const applyToAll = () => (goals = goals.map(() => ({ ...goals[0] })));
</script>

<div class="wrap">
  <div class="head">
    <Label>{goals.length} set{goals.length > 1 ? 's' : ''}</Label>
    <button class="link" onclick={applyToAll}>Copy set 1 → all</button>
  </div>
  <div class="list">
    {#each goals as g, i (i)}
      <div class="set">
        <div class="set-head">
          <Label>Set {i + 1}</Label>
          {#if goals.length > 1}
            <button class="del" onclick={() => goals.splice(i, 1)} aria-label="Remove set {i + 1}"><Icon name="trash" size={12} /></button>
          {/if}
        </div>
        <div class="row" style="gap:8px">
          <NumField label="Reps" bind:value={g.reps} suffix="reps" />
          <NumField label="Weight" bind:value={g.weight} suffix={unit()} step={liftStep()} />
        </div>
        <div style="margin-top:8px"><BodyweightPresets {equipment} bind:value={g.weight} /></div>
        <div style="margin-top:8px"><NumField label="Rest" bind:value={g.restSeconds} suffix="s" step={15} /></div>
      </div>
    {/each}
  </div>
  <button class="dashed-btn add" onclick={addSet}><Icon name="plus" size={12} /> Add set</button>
  <div class="row" style="margin-top:6px">
    <Button variant="secondary" full onclick={oncancel}>Cancel</Button>
    <Button full onclick={() => onsave($state.snapshot(goals).map((g, i) => ({ ...g, weight: original[i] ? keepOrConvert(original[i].weight, g.weight) : toKgSafe(g.weight) })))}>Save goals</Button>
  </div>
</div>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
  .head, .set-head { display: flex; justify-content: space-between; align-items: center; }
  .set-head { margin-bottom: 10px; }
  .link { background: transparent; border: none; color: var(--text-mid); font-family: var(--f-mono); font-size: 12px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .set { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
  .del { background: transparent; border: none; color: var(--danger); cursor: pointer; padding: 4px; }
  .add { padding: 10px; border-radius: 10px; font-size: 13px; gap: 6px; }
</style>
