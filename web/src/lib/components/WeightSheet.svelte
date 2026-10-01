<script lang="ts">
  import Button from './Button.svelte';
  import NumField from './NumField.svelte';
  import Label from './Label.svelte';
  import { store } from '../store.svelte';
  import { unit, toUnit, keepOrConvert } from '../units';

  let { date, onclose }: { date: string; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const existing = store.weights.find((w) => w.date === date);
  const last = store.weights.at(-1);
  // svelte-ignore state_referenced_locally
  const startKg = existing?.kg ?? last?.kg ?? 75;
  // svelte-ignore state_referenced_locally
  let value = $state(toUnit(startKg));
  const kg = $derived(keepOrConvert(startKg, value));
  // svelte-ignore state_referenced_locally
  let day = $state(date);

  const save = () => { store.saveWeight({ id: day, date: day, kg: Math.round(kg * 100) / 100 }); onclose(); };
</script>

<div class="wrap">
  <label class="date"><Label>Date</Label><input type="date" bind:value={day} max={store.todayStr} /></label>
  <NumField label="Body weight" bind:value={value} suffix={unit()} step={0.1} />
  <div class="row">
    {#if store.weights.some((w) => w.date === day)}
      <Button variant="danger" onclick={() => { store.deleteWeight(day); onclose(); }}>Delete</Button>
    {/if}
    <Button full onclick={save} disabled={!(kg >= 20 && kg <= 400) || !day}>Save</Button>
  </div>
</div>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .date { display: flex; flex-direction: column; gap: 6px; }
  input { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; color: var(--text);
    font-family: var(--f-sans); font-size: 14px; color-scheme: inherit; }
</style>
