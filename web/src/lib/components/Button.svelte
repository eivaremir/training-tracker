<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { children, onclick, variant = 'primary', icon, full = false, size = 'md', disabled = false, type = 'button' }: {
    children: Snippet; onclick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: string; full?: boolean; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; type?: 'button' | 'submit';
  } = $props();
</script>

<button {type} class="{variant} {size}" class:full {onclick} {disabled}>
  {#if icon}<Icon name={icon} size={16} />{/if}
  {@render children()}
</button>

<style>
  button { border-radius: 10px; font-family: var(--f-cond); font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: 0.4; }
  .full { width: 100%; }
  .primary { background: var(--text); color: var(--bg); border: 1px solid var(--text); }
  .secondary { background: transparent; color: var(--text); border: 1px solid var(--border-hi); }
  .ghost { background: transparent; color: var(--text); border: none; }
  .danger { background: transparent; color: var(--danger); border: 1px solid var(--border); }
  .sm { padding: 8px 12px; font-size: 13px; }
  .md { padding: 12px 16px; font-size: 13px; }
  .lg { padding: 16px 20px; font-size: 14px; }
</style>
