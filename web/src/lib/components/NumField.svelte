<script lang="ts">
  import Label from './Label.svelte';
  let { label, value = $bindable(0), suffix, step = 1 }: { label: string; value?: number; suffix?: string; step?: number } = $props();
  const round = (n: number) => Math.round(n * 100) / 100;
</script>

<div class="wrap">
  <Label>{label}</Label>
  <div class="field">
    <button onclick={() => (value = round(Math.max(0, value - step)))} aria-label="Decrease {label}">−</button>
    <input inputmode="decimal" value={value} oninput={(e) => (value = Number(e.currentTarget.value) || 0)} />
    <span>{suffix}</span>
    <button onclick={() => (value = round(value + step))} aria-label="Increase {label}">+</button>
  </div>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .field { display: flex; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; min-width: 0; }
  button { width: 32px; height: 48px; flex-shrink: 0; background: transparent; border: none; color: var(--text); font-size: 18px; cursor: pointer; }
  input { flex: 1; min-width: 0; width: 0; background: transparent; border: none; outline: none; color: var(--text); text-align: center;
    font-family: var(--f-cond); font-weight: 600; font-size: 20px; font-variant-numeric: tabular-nums; padding: 0; }
  span { color: var(--text-low); font-family: var(--f-mono); flex-shrink: 0; font-size: 11px; padding-right: 6px; letter-spacing: 1px; text-transform: uppercase; }
</style>
