<script lang="ts">
  // Quick weights for bodyweight exercises: a share of the latest weigh-in. How much of your body weight an
  // exercise really moves varies (push-up ≈ 70%, pull-up or dip ≈ 100%), so a few common shares are offered.
  import Label from './Label.svelte';
  import { store } from '../store.svelte';
  import { latestBodyKg, isBodyweight, toUnit, unit } from '../units';

  let { equipment, value = $bindable() }: { equipment?: string[]; value: number } = $props();

  const SHARES = [70, 80, 90, 100];
  const bodyKg = $derived(latestBodyKg());
  const latest = $derived(store.weights.at(-1));
  const amount = (pct: number) => toUnit((bodyKg ?? 0) * pct / 100);
</script>

{#if isBodyweight(equipment) && bodyKg}
  <div class="bw">
    <Label size={9} color="var(--text-low)">% of body weight · {toUnit(bodyKg)} {unit()}{latest ? ` (${latest.date})` : ''}</Label>
    <div class="chips">
      {#each SHARES as pct (pct)}
        <button class:on={value === amount(pct)} onclick={() => (value = amount(pct))} aria-label="{pct}% of body weight, {amount(pct)} {unit()}">
          <span class="pct">{pct}%</span><span class="amt">{amount(pct)}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .bw { display: flex; flex-direction: column; gap: 6px; }
  .chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  button { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 4px; cursor: pointer;
    color: var(--text); display: flex; flex-direction: column; align-items: center; gap: 1px; }
  button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .pct { font-family: var(--f-cond); font-weight: 600; font-size: 15px; letter-spacing: 0.5px; }
  .amt { font-family: var(--f-mono); font-size: 11px; opacity: 0.8; }
</style>
