<script lang="ts">
  let { size = 56, label = 'PHOTO', radius = 8 }: { size?: number; label?: string; radius?: number } = $props();
</script>

<div style="width:{size}px;height:{size}px;border-radius:{radius}px">{label}</div>

<style>
  div { background: repeating-linear-gradient(45deg, var(--stripe-a) 0 6px, var(--stripe-b) 6px 12px);
    border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-low);
    font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.5px; flex-shrink: 0; }
</style>
