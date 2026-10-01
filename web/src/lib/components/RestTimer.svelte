<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  let { seconds, ondone }: { seconds: number; ondone: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let remaining = $state(seconds);
  let paused = $state(false);

  $effect(() => {
    if (paused) return;
    if (remaining <= 0) { ondone(); return; }
    const t = setTimeout(() => (remaining -= 1), 1000);
    return () => clearTimeout(t);
  });

  const pct = $derived(Math.max(0, remaining / seconds));
  const mm = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
  const ss = $derived(String(remaining % 60).padStart(2, '0'));
</script>

<div class="timer">
  <div class="bar"><div style:height="{pct * 100}%"></div></div>
  <div class="mid">
    <Label>Rest</Label>
    <div class="time">{mm}:{ss}</div>
  </div>
  <button class="pause" onclick={() => (paused = !paused)} aria-label={paused ? 'Resume' : 'Pause'}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
  <button class="skip" onclick={ondone} aria-label="Skip rest"><Icon name="x" size={16} /></button>
</div>

<style>
  @media (min-width: 720px) {
    .timer { left: auto !important; right: 16px !important; bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important; width: 420px; }
  }
  .timer { position: fixed; left: 12px; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 50; max-width: 456px; margin: 0 auto;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: 14px; padding: 14px 16px;
    display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow); }
  .bar { width: 4px; height: 44px; background: var(--border); border-radius: 2px; position: relative; overflow: hidden; }
  .bar div { position: absolute; bottom: 0; left: 0; right: 0; background: var(--text); transition: height 1s linear; }
  .mid { flex: 1; }
  .time { font-family: var(--f-cond); font-weight: 700; font-size: 32px; color: var(--text); letter-spacing: 0.5px; font-variant-numeric: tabular-nums; line-height: 1; }
  button { width: 40px; height: 40px; border-radius: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .pause { background: transparent; border: 1px solid var(--border-hi); color: var(--text); }
  .skip { background: var(--text); border: none; color: var(--bg); }
</style>
