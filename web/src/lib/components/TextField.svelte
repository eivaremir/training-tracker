<script lang="ts">
  import Label from './Label.svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  let { label, value = $bindable(''), ...rest }: { label: string; value?: string } & Omit<HTMLInputAttributes, 'value'> = $props();
</script>

<label>
  <Label>{label}</Label>
  <input bind:value {...rest} />
</label>

<style>
  label { display: flex; flex-direction: column; gap: 6px; }
  input { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px; color: var(--text);
    outline: none; font-family: var(--f-sans); font-size: 14px; }
</style>
