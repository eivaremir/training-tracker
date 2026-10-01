<script lang="ts">
  import Label from './Label.svelte';
  import EquipmentIcon from './EquipmentIcon.svelte';
  import { EQUIPMENT } from '../equipment';

  let { value = $bindable([]) }: { value?: string[] } = $props();
  const toggle = (id: string) => (value = value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
</script>

<div class="wrap">
  <Label>Equipment</Label>
  <div class="grid">
    {#each Object.entries(EQUIPMENT) as [id, label] (id)}
      <button type="button" class:on={value.includes(id)} aria-pressed={value.includes(id)} onclick={() => toggle(id)}>
        <EquipmentIcon {id} size={18} /><span>{label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
  button { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 10px 6px; border-radius: 10px; cursor: pointer;
    background: var(--bg); border: 1px solid var(--border); color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 11px; letter-spacing: 0.8px; text-transform: uppercase; text-align: center; }
  button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
</style>
