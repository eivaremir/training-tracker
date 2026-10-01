<script lang="ts">
  let { on = $bindable(false), onchange, disabled = false, label = 'Toggle' }: {
    on?: boolean; onchange?: (v: boolean) => void; disabled?: boolean; label?: string;
  } = $props();
  // With onchange the parent decides the new value (e.g. after a permission prompt).
  const flip = () => (onchange ? onchange(!on) : (on = !on));
</script>

<button class:on onclick={flip} {disabled} role="switch" aria-checked={on} aria-label={label}><div></div></button>

<style>
  button { width: 44px; height: 26px; border-radius: 13px; background: var(--surface-hi); border: 1px solid var(--border-hi);
    position: relative; cursor: pointer; padding: 0; transition: background 0.15s; flex-shrink: 0; }
  div { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 10px; background: var(--text); transition: left 0.15s; }
  .on { background: var(--text); border-color: var(--text); }
  .on div { left: 20px; background: var(--bg); }
  button:disabled { opacity: 0.4; cursor: default; }
</style>
