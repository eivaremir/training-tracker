<script lang="ts">
  // Swipe right = log as hit goal, swipe left = edit reps/weight.
  import Icon from './Icon.svelte';
  import BigNum from './BigNum.svelte';
  import Label from './Label.svelte';
  import type { SetGoal, SetLog } from '../types';

  let { idx, goal, log, isActive, onhit, onedit, onundo }: {
    idx: number; goal: SetGoal; log?: SetLog; isActive: boolean;
    onhit: () => void; onedit: () => void; onundo: () => void;
  } = $props();

  let dx = $state(0);
  let dragging = $state(false);
  let startX = 0;

  const logged = $derived(!!log);
  const hit = $derived(!!log?.hitGoal);
  const intensity = $derived(Math.min(1, Math.abs(dx) / 80));

  const pointX = (e: PointerEvent) => e.clientX;
  function start(e: PointerEvent) {
    if (logged) return;
    startX = pointX(e);
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    dx = Math.max(-160, Math.min(160, pointX(e) - startX));
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    if (dx > 80) onhit();
    else if (dx < -80) onedit();
    dx = 0;
  }
  function key(e: KeyboardEvent) {
    if (logged) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') onhit();
    if (e.key === 'ArrowLeft') onedit();
  }
</script>

<div class="set" style:border-color={isActive && !logged ? 'var(--border-hi)' : 'var(--border)'}>
  {#if dx > 8}
    <div class="hint right" style:background="linear-gradient(90deg, rgba(var(--glow),{0.1 + intensity * 0.15}) 0%, transparent 60%)">
      <Icon name="check" size={20} /><span>Hit goal</span>
    </div>
  {/if}
  {#if dx < -8}
    <div class="hint left" style:background="linear-gradient(270deg, rgba(var(--glow),{0.05 + intensity * 0.1}) 0%, transparent 60%)">
      <span>Edit</span><Icon name="edit" size={18} />
    </div>
  {/if}

  <div class="fg" role="button" tabindex={logged ? -1 : 0}
    aria-label="Set {idx + 1}: swipe right to log as hit, left to edit"
    onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={end} onkeydown={key}
    style:background={logged ? (hit ? 'var(--log-hit)' : 'var(--log-miss)') : isActive ? 'var(--surface-hi)' : 'var(--surface)'}
    style:transform="translateX({dx}px)"
    style:transition={dragging ? 'none' : 'transform 0.18s cubic-bezier(0.2,0.9,0.3,1)'}
    style:cursor={logged ? 'default' : 'grab'}>
    <div class="idx" style:color={logged ? (hit ? 'var(--text)' : 'var(--text-mid)') : isActive ? 'var(--text)' : 'var(--text-low)'}>{idx + 1}</div>

    <div class="vals">
      {#if log}
        {@const c = hit ? 'var(--text)' : 'var(--text-mid)'}
        <div class="pair">
          <BigNum size={26} color={c}>{log.actual?.reps ?? '—'}</BigNum><Label size={9}>×</Label>
          <BigNum size={26} color={c}>{log.actual?.weight ?? 0}</BigNum><Label size={9}>kg</Label>
        </div>
        {#if !hit && log.actual && log.goalSnapshot}
          <Label size={9} color="var(--text-low)">goal {log.goalSnapshot.reps}×{log.goalSnapshot.weight}</Label>
        {/if}
      {:else}
        {@const c = isActive ? 'var(--text)' : 'var(--text-mid)'}
        <div class="pair">
          <BigNum size={26} color={c}>{goal.reps}</BigNum><Label size={9}>×</Label>
          <BigNum size={26} color={c}>{goal.weight}</BigNum><Label size={9}>kg</Label>
        </div>
      {/if}
    </div>

    {#if logged}
      <button class="undo" class:hit onclick={onundo} onpointerdown={(e) => e.stopPropagation()} aria-label="Undo set">
        <Icon name={hit ? 'check' : 'edit'} size={16} />
      </button>
    {:else}
      <div class="chev"><Icon name="chev-l" size={14} /><Icon name="chev-r" size={14} /></div>
    {/if}
  </div>
</div>

<style>
  .set { position: relative; overflow: hidden; border-radius: 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); }
  .hint { position: absolute; inset: 0; display: flex; align-items: center; gap: 10px; color: var(--text); }
  .hint span { font-family: var(--f-cond); font-weight: 600; font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; }
  .hint.right { padding-left: 22px; }
  .hint.left { justify-content: flex-end; padding-right: 22px; }
  .fg { position: relative; padding: 14px 16px; display: flex; align-items: center; gap: 14px; user-select: none; touch-action: pan-y; outline: none; }
  .fg:focus-visible { box-shadow: inset 0 0 0 1px var(--border-hi); }
  .idx { width: 28px; text-align: center; flex-shrink: 0; font-family: var(--f-cond); font-weight: 700; font-size: 22px; font-variant-numeric: tabular-nums; }
  .vals { flex: 1; display: flex; align-items: baseline; gap: 14px; }
  .pair { display: flex; align-items: baseline; gap: 4px; }
  .undo { width: 36px; height: 36px; border-radius: 18px; background: var(--surface-hi); color: var(--text-mid); border: 1px solid var(--border-hi);
    display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .undo.hit { background: var(--text); color: var(--bg); border: none; }
  .chev { display: flex; align-items: center; gap: 4px; color: var(--text-low); }
</style>
