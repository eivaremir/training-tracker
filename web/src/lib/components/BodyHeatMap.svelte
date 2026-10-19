<script lang="ts">
  // Read-only heat map of training load between two local dates (inclusive), by volume (weight × reps), weight or reps.
  import type { Snippet } from 'svelte';
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import BodyFigure from './BodyFigure.svelte';
  import { MUSCLES, PARENT, SHAPES, childrenOf, libraryHref } from '../muscles';
  import { heatColor } from '../heat';
  import { addDays, parseYmd, ymd } from '../dates';
  import { store } from '../store.svelte';
  import { toUnit, unit, latestBodyKg, isBodyweight } from '../units';
  import { tracksVolume, HEAT_METRICS, type HeatMetric } from '../volume';

  // `from`/`to` are YYYY-MM-DD; the default is the last 7 days. `controls` renders beside the title.
  let { from = ymd(addDays(store.today, -6)), to = store.todayStr, controls }: { from?: string; to?: string; controls?: Snippet } = $props();
  let hover = $state<string | null>(null);

  // Metric choice is remembered per viewer; storage can be unavailable (private mode, SSR).
  const KEY = 'tt-heat-metric';
  const readMetric = (): HeatMetric => {
    try { const v = localStorage.getItem(KEY); return HEAT_METRICS.some((m) => m.key === v) ? (v as HeatMetric) : 'volume'; } catch { return 'volume'; }
  };
  let metric = $state<HeatMetric>(readMetric());
  const setMetric = (m: HeatMetric) => { metric = m; try { localStorage.setItem(KEY, m); } catch { /* private mode */ } };
  const isReps = $derived(metric === 'reps');

  // "Oct 13 – Oct 19", or "Oct 1" when the range is a single day.
  const fmtDay = (s: string) => parseYmd(s).toLocaleString('en-US', { month: 'short', day: 'numeric' });
  const rangeText = $derived(from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);

  const stats = $derived.by(() => {
    const logs = store.sessions.filter((s) => s.date >= from && s.date <= to).flatMap((s) => s.logs).filter((l) => l.actual);
    const score: Record<string, number> = {}, groups: Record<string, number> = {};
    const bodyKg = latestBodyKg() ?? 0;
    let total = 0;
    const credit = (id: string, w: number) => {
      const hs = childrenOf(id);
      (hs.length ? hs : [id]).forEach((h) => (score[h] = (score[h] || 0) + w));
    };
    logs.forEach((l) => {
      const ex = store.exercise(l.exerciseId);
      if (!ex?.muscles) return;
      const reps = l.actual!.reps;
      // Bodyweight sets logged as 0 move the lifter's own weight (latest weigh-in).
      const kg = l.actual!.weight || (isBodyweight(ex.equipment) ? bodyKg : 0);
      // Reps count every set (cardio/stretching too); volume and weight exclude the categories that don't track load.
      const amt = metric === 'reps' ? reps : metric === 'weight' ? (tracksVolume(ex) ? kg : 0) : kg * reps;
      if (!amt) return;
      total += amt;
      ex.muscles.primary.forEach((id) => credit(id, amt));
      ex.muscles.secondary.forEach((id) => credit(id, amt * 0.5));
      [...new Set(ex.muscles.primary.map((id) => PARENT[id] || id))].forEach((g) => (groups[g] = (groups[g] || 0) + amt));
    });
    const max = Math.max(1, ...Object.values(score));
    const top = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const untrained = Object.keys(MUSCLES).filter((g) => !PARENT[g] && !groups[g] && !childrenOf(g).some((c) => score[c]) && !score[g]);
    return { logs, total, score, max, top, topMax: top[0]?.[1] || 1, untrained };
  });

  // Compact display: a reps count, or the metric's weight in the display unit (950 lb, 12.4k lb).
  const disp = (n: number) => {
    const v = isReps ? n : toUnit(n, 0);
    return v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k` : String(Math.round(v));
  };
  const unitLabel = $derived(isReps ? 'reps' : unit());
  // Share of everything in the window that worked this muscle (secondary work counts half).
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const heat = (id: string) => (stats.score[id] ? heatColor(0.12 + (0.88 * stats.score[id]) / stats.max) : 'var(--surface-hihi)');
</script>

<div class="card box">
  <div class="head">
    <Label>Muscle load</Label>
    <div class="ctl">
      <div class="pill" role="radiogroup" aria-label="Muscle load metric">
        {#each HEAT_METRICS as m (m.key)}
          <button role="radio" aria-checked={metric === m.key} class:on={metric === m.key} onclick={() => setMetric(m.key)}>{m.label}</button>
        {/each}
      </div>
      {@render controls?.()}
    </div>
  </div>
  <div class="sub">
    <Label size={9} color="var(--text-low)">{rangeText}</Label>
    <Label size={9} color="var(--text-low)">{disp(stats.total)} {unitLabel}{isReps ? '' : ' lifted'}</Label>
  </div>
  <!-- Fixed-height line so the figures don't jump while hovering. -->
  <div class="detail" aria-live="polite">
    {#if hover}<Label size={9} color="var(--text)">{MUSCLES[hover]} · {disp(stats.score[hover] || 0)} {unitLabel} · {pct(stats.score[hover] || 0)}% of load</Label>
    {:else}<Label size={9} color="var(--text-low)">Hover or tap a muscle</Label>{/if}
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
          <span class="n"><BigNum size={16}>{disp(n)}</BigNum><span class="u">{unitLabel}</span></span>
          <span class="p">{pct(n)}%</span>
        </div>
      {/each}
    </div>
  {/if}
  {#if stats.untrained.length}
    <div class="untrained">
      <Label size={9} color="var(--text-low)">Not trained · tap to find exercises</Label>
      <div class="chips">{#each stats.untrained as g (g)}<a class="chip" href={libraryHref(g)}>{MUSCLES[g]}</a>{/each}</div>
    </div>
  {/if}
</div>

<style>
  .box { padding: 14px; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 18px; flex-wrap: wrap; }
  .ctl { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .pill button { padding: 4px 9px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .sub { margin-top: 6px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .detail { height: 16px; margin-top: 4px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .figs { margin-top: 6px; display: flex; gap: 4px; }
  .scale { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .scale span { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 1px; }
  .scale div { flex: 1; height: 6px; border-radius: 3px; }
  .top { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) 72px 34px; align-items: center; gap: 10px; }
  .name { font-family: var(--f-sans); font-size: 13px; color: var(--text); }
  .track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; }
  .n { text-align: right; white-space: nowrap; }
  .p { text-align: right; font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); }
  .u { margin-left: 3px; font-family: var(--f-mono); font-size: 11px; color: var(--text-low); }
  .untrained { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
  .chips { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 6px 10px; border: 1px solid var(--border-hi); border-radius: 8px; color: var(--text); text-decoration: none;
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .chip:hover { background: var(--surface-hi); }
</style>
