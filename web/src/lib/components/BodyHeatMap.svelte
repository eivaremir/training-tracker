<script lang="ts">
  // Read-only heat map of training load over the last N days.
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import BodyFigure from './BodyFigure.svelte';
  import { MUSCLES, PARENT, SHAPES, childrenOf } from '../muscles';
  import { heatColor } from '../heat';
  import { addDays, ymd } from '../dates';
  import { store } from '../store.svelte';

  let { days = 7 }: { days?: number } = $props();
  let hover = $state<string | null>(null);

  const stats = $derived.by(() => {
    const cut = ymd(addDays(store.today, -(days - 1)));
    const today = store.todayStr;
    const logs = store.sessions.filter((s) => s.date >= cut && s.date <= today).flatMap((s) => s.logs).filter((l) => l.actual);
    const score: Record<string, number> = {}, groupSets: Record<string, number> = {};
    const credit = (id: string, w: number) => {
      const hs = childrenOf(id);
      (hs.length ? hs : [id]).forEach((h) => (score[h] = (score[h] || 0) + w));
    };
    logs.forEach((l) => {
      const ex = store.exercise(l.exerciseId);
      if (!ex?.muscles) return;
      ex.muscles.primary.forEach((id) => credit(id, 1));
      ex.muscles.secondary.forEach((id) => credit(id, 0.5));
      [...new Set(ex.muscles.primary.map((id) => PARENT[id] || id))].forEach((g) => (groupSets[g] = (groupSets[g] || 0) + 1));
    });
    const max = Math.max(1, ...Object.values(score));
    const top = Object.entries(groupSets).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const untrained = Object.keys(MUSCLES).filter((g) => !PARENT[g] && !groupSets[g] && !childrenOf(g).some((c) => score[c]) && !score[g]);
    return { logs, score, max, top, topMax: top[0]?.[1] || 1, untrained };
  });

  const heat = (id: string) => (stats.score[id] ? heatColor(0.12 + (0.88 * stats.score[id]) / stats.max) : 'var(--surface-hihi)');
</script>

<div class="card box">
  <div class="head">
    <Label>Muscle load · {days} days</Label>
    <Label size={9} color={hover ? 'var(--text)' : 'var(--text-low)'}>
      {hover ? `${MUSCLES[hover]} · ${(stats.score[hover] || 0).toFixed(1).replace('.0', '')} sets` : `${stats.logs.length} sets logged`}
    </Label>
  </div>
  <div class="figs">
    <BodyFigure shapes={SHAPES.advanced.front} label="Front" fill={heat} bind:hover />
    <BodyFigure shapes={SHAPES.advanced.back} label="Back" fill={heat} bind:hover />
  </div>
  <div class="scale">
    <span>LOW</span>
    <div style:background="linear-gradient(90deg, {heatColor(0.12)}, {heatColor(0.45)}, {heatColor(0.75)}, {heatColor(1)})"></div>
    <span>HIGH</span>
  </div>
  {#if stats.top.length}
    <div class="top">
      {#each stats.top as [g, n] (g)}
        <div class="bar-row">
          <span class="name">{MUSCLES[g]}</span>
          <div class="track"><div style:width="{(n / stats.topMax) * 100}%" style:background={heatColor(0.3 + (0.7 * n) / stats.topMax)}></div></div>
          <span class="n"><BigNum size={16}>{n}</BigNum></span>
        </div>
      {/each}
    </div>
  {/if}
  {#if stats.untrained.length}
    <div class="untrained"><Label size={9} color="var(--text-low)">Not trained: {stats.untrained.map((g) => MUSCLES[g]).join(' · ')}</Label></div>
  {/if}
</div>

<style>
  .box { padding: 14px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .figs { margin-top: 10px; display: flex; gap: 4px; }
  .scale { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .scale span { font-family: var(--f-mono); font-size: 9px; color: var(--text-low); letter-spacing: 1px; }
  .scale div { flex: 1; height: 6px; border-radius: 3px; }
  .top { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) 28px; align-items: center; gap: 10px; }
  .name { font-family: var(--f-sans); font-size: 12px; color: var(--text); }
  .track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; }
  .n { text-align: right; }
  .untrained { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
</style>
