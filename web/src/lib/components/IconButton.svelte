<script lang="ts">
  import Icon from './Icon.svelte';
  let { icon, onclick, size = 20, label }: { icon: string; onclick?: () => void; size?: number; label?: string } = $props();
</script>

<button {onclick} aria-label={label ?? icon}><Icon name={icon} {size} /></button>

<style>
  button { width: 36px; height: 36px; border-radius: 8px; background: transparent; border: none; color: var(--text);
    display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
</style>
