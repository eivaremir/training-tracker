<script lang="ts">
  // Per-exercise scatter: volume (weight × reps) per logged set or per training day, coloured by recency (old = cold, recent = hot).
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import VolumeHeatmap from './VolumeHeatmap.svelte';
  import { heatColor } from '../heat';
  import { addDays, mondayOf, parseYmd } from '../dates';
  import { store } from '../store.svelte';
  import { unit, toUnit, latestBodyKg, isBodyweight } from '../units';

  let { exerciseId }: { exerciseId: string } = $props();
  const ex = $derived(store.exercise(exerciseId));

  type Axis = 'set' | 'date';
  type Metric = 'volume' | 'weight';
  const AXES: [Axis, string][] = [['set', 'Set #'], ['date', 'Date']];
  const METRICS: [Metric, string][] = [['volume', 'Volume'], ['weight', 'Weight']];

  // Chart choices are remembered per viewer; storage can be unavailable (private mode, SSR).
  const readPref = <T extends string>(key: string, options: [T, string][], fallback: T): T => {
    try { const v = localStorage.getItem(key); return options.find(([o]) => o === v)?.[0] ?? fallback; } catch { return fallback; }
  };
  const writePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };
  let axis = $state(readPref('tt-stats-axis', AXES, 'date'));
  let metric = $state(readPref('tt-stats-metric', METRICS, 'volume'));
  const setAxis = (v: Axis) => { axis = v; writePref('tt-stats-axis', v); };
  const setMetric = (v: Metric) => { metric = v; writePref('tt-stats-metric', v); };

  const W = 320, H = 200, padL = 38, padR = 16, padT = 14, padB = 24, inset = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const DAY = 864e5;

  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  // Compact so axis labels and KPI tiles fit: 950, 1.98k, 12.4k.
  const fmtNum = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : String(+v.toFixed(1)));
  // 1 / 2 / 2.5 / 5 × 10ⁿ: tick steps that read well (2.5 matches plate jumps).
  const niceStep = (raw: number) => {
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].find((f) => raw / mag <= f)! * mag;
  };

  // Set numbers: 1 plus round multiples (1, 10, 20, 30).
  const setTicks = (n: number) => {
    const step = Math.max(1, Math.round(niceStep(n / 4)));
    const out = [1];
    for (let v = step; v <= n; v += step) if (v - 1 >= step / 2) out.push(v);
    return out;
  };

  // Calendar ticks between two local midnights: days, Mondays or month starts, at most ~6 across.
  const dateTicks = (lo: number, hi: number) => {
    const span = (hi - lo) / DAY;
    const out: { t: number; label: string }[] = [];
    const step = [1, 2, 7, 14].find((s) => span / s <= 5);
    if (step) {
      let d = step >= 7 ? mondayOf(new Date(lo)) : new Date(lo);
      if (d.getTime() < lo) d = addDays(d, 7);
      for (; d.getTime() <= hi; d = addDays(d, step)) out.push({ t: d.getTime(), label: fmtDay(d) });
    } else {
      const months = [1, 2, 3, 6, 12].find((m) => span / (30.4 * m) <= 5) ?? 12;
      const first = new Date(lo);
      for (let d = new Date(first.getFullYear(), first.getMonth() + (first.getDate() > 1 ? 1 : 0), 1); d.getTime() <= hi; d = new Date(d.getFullYear(), d.getMonth() + months, 1))
        out.push({ t: d.getTime(), label: d.getMonth() ? d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : String(d.getFullYear()) });
    }
    return out;
  };

  type Row = { date: string; reps: number; kg: number; vol: number; hit: boolean; sets: number };

  // Every logged set in date order with the load it actually moved, plus the same grouped per calendar day.
  const data = $derived.by(() => {
    const bw = isBodyweight(ex?.equipment);
    // Bodyweight sets logged as 0 move the lifter's own weight (latest weigh-in), as on the dashboard heat map.
    const bodyKg = bw ? (latestBodyKg() ?? 0) : 0;
    const logs = store.sessions
      .flatMap((s) => s.logs.filter((l) => l.exerciseId === exerciseId && l.actual).map((l) => ({ ...l, date: s.date })))
      .sort((a, b) => a.date.localeCompare(b.date) || a.loggedAt.localeCompare(b.loggedAt));
    const n = logs.length;
    if (!n) return null;
    const sets = logs.map((l, i) => {
      const { reps, weight } = l.actual!;
      const kg = weight || bodyKg;
      return { date: l.date, reps, weight, kg, vol: kg * reps, hit: l.hitGoal, sets: 1, t: n === 1 ? 1 : i / (n - 1) };
    });
    const days: Row[] = [];
    for (const s of sets) {
      const d = days.at(-1);
      if (d?.date === s.date) { d.reps += s.reps; d.kg = Math.max(d.kg, s.kg); d.vol += s.vol; d.hit &&= s.hit; d.sets++; }
      else days.push({ date: s.date, reps: s.reps, kg: s.kg, vol: s.vol, hit: s.hit, sets: 1 });
    }
    // No load at all (e.g. bodyweight moves before any weigh-in): chart reps instead of a flat line at 0.
    const loadless = sets.every((s) => !s.kg);
    const best = (rows: Row[], f: (r: Row) => number) => Math.max(...rows.map(f));
    const kpis = loadless
      ? [
          { label: 'Sets', value: n, suffix: '' },
          { label: 'Days', value: days.length, suffix: '' },
          { label: 'Best set', value: best(sets, (r) => r.reps), suffix: 'reps' },
          { label: 'Best day', value: best(days, (r) => r.reps), suffix: 'reps' }
        ]
      : [
          { label: 'Sets', value: n, suffix: '' },
          { label: 'PR', value: toUnit(best(sets, (r) => r.kg)), suffix: unit() },
          { label: 'Best set', value: fmtNum(toUnit(best(sets, (r) => r.vol), 0)), suffix: unit() },
          { label: 'Best day', value: fmtNum(toUnit(best(days, (r) => r.vol), 0)), suffix: unit() }
        ];
    return { sets, days, loadless, needsWeighIn: loadless && bw, kpis, hitPct: Math.round((sets.filter((s) => s.hit).length / n) * 100) };
  });

  const view = $derived.by(() => {
    if (!data) return null;
    const byDate = axis === 'date';
    const rows: Row[] = byDate ? data.days : data.sets;
    const m = rows.length;
    const yUnit = data.loadless ? 'reps' : unit();
    const yOf = (r: Row) => (data.loadless ? r.reps : metric === 'weight' ? toUnit(r.kg) : toUnit(r.vol, 0));
    const title = `${data.loadless ? 'Reps' : metric === 'weight' ? (byDate ? 'Top set' : 'Weight') : 'Volume'} per ${byDate ? 'day' : 'set'}`;

    // x: set number, or real time between the first and last training day (a day either side when there's only one).
    const time = (d: string) => parseYmd(d).getTime();
    let lo = byDate ? time(rows[0].date) : 1, hi = byDate ? time(rows[m - 1].date) : m;
    if (byDate && lo === hi) { lo -= DAY; hi += DAY; }
    const sx = (x: number) => padL + inset + (hi === lo ? 0.5 : (x - lo) / (hi - lo)) * (plotW - 2 * inset);

    const ys = rows.map(yOf);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = (maxY - minY) * 0.15 || maxY * 0.1 || 5;
    const step = niceStep((maxY - minY + 2 * pad) / 3);
    const yLo = Math.max(0, Math.floor((minY - pad) / step) * step), yHi = Math.ceil((maxY + pad) / step) * step;
    const sy = (y: number) => padT + plotH - ((y - yLo) / (yHi - yLo || 1)) * plotH;

    const points = rows.map((r, i) => {
      const y = ys[i];
      const what = byDate ? `${r.sets} set${r.sets === 1 ? '' : 's'} · ${y} ${yUnit}`
        : `${r.reps} × ${toUnit(r.kg)} ${unit()}${!data.loadless && metric === 'volume' ? ` = ${y} ${yUnit}` : ''}`;
      return { cx: sx(byDate ? time(r.date) : i + 1), cy: sy(y), hit: r.hit, t: m === 1 ? 1 : i / (m - 1), tip: `${fmtDay(parseYmd(r.date))} · ${what}` };
    });
    return {
      byDate, title, yUnit, points,
      yTicks: Array.from({ length: Math.round((yHi - yLo) / step) + 1 }, (_, i) => +(yLo + i * step).toFixed(6)).map((v) => ({ y: sy(v), label: fmtNum(v) })),
      xTicks: byDate ? dateTicks(lo, hi).map((k) => ({ x: sx(k.t), label: k.label })) : setTicks(m).map((v) => ({ x: sx(v), label: String(v) })),
      line: byDate && m > 1 ? points.map((p) => `${p.cx},${p.cy}`).join(' ') : null,
      aria: `${title} for ${ex?.name ?? 'this exercise'}, in ${yUnit}, by ${byDate ? 'date' : 'set number'}: ${m} ${byDate ? 'days' : 'sets'}` +
        `, first ${fmtNum(ys[0])}, latest ${fmtNum(ys[m - 1])}, peak ${fmtNum(maxY)}`
    };
  });
</script>

{#if !data || !view}
  <div class="empty">
    <Icon name="chart" size={28} />
    <div>No logged sets yet for <strong>{ex?.name}</strong>.</div>
  </div>
{:else}
  <div class="wrap">
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);border-radius:10px">
      {#each data.kpis as k (k.label)}
        <div style="padding:10px 8px">
          <Label size={8} color="var(--text-low)">{k.label}</Label>
          <div style="margin-top:2px"><BigNum size={20}>{k.value}</BigNum>{#if k.suffix}<span class="suffix" style="font-size:12px;margin-left:1px">{k.suffix}</span>{/if}</div>
        </div>
      {/each}
    </div>

    <div class="chart">
      <div class="controls">
        {#if !data.loadless}
          <div class="pill" role="radiogroup" aria-label="Chart metric">
            {#each METRICS as [v, label] (v)}
              <button role="radio" aria-checked={metric === v} class:on={metric === v} onclick={() => setMetric(v)}>{label}</button>
            {/each}
          </div>
        {/if}
        <div class="pill" role="radiogroup" aria-label="X axis" style="margin-left:auto">
          {#each AXES as [v, label] (v)}
            <button role="radio" aria-checked={axis === v} class:on={axis === v} onclick={() => setAxis(v)}>{label}</button>
          {/each}
        </div>
      </div>
      <div class="chart-head">
        <Label>{view.title} · {view.yUnit}</Label>
        <Label size={9} color="var(--text-low)">{view.points.length} {view.byDate ? (view.points.length === 1 ? 'day' : 'days') : (view.points.length === 1 ? 'set' : 'sets')}</Label>
      </div>
      <svg width="100%" viewBox="0 0 {W} {H}" role="img" aria-label={view.aria}>
        {#each view.yTicks as k}
          <line x1={padL} x2={W - padR} y1={k.y} y2={k.y} stroke="var(--border)" stroke-dasharray="2 3" />
          <text x={padL - 6} y={k.y + 3} fill="var(--text-low)" font-size="10" font-family="JetBrains Mono, monospace" text-anchor="end">{k.label}</text>
        {/each}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--border)" />
        {#each view.xTicks as k}
          <line x1={k.x} x2={k.x} y1={H - padB} y2={H - padB + 3} stroke="var(--border)" />
          <text x={k.x} y={H - padB + 14} fill="var(--text-low)" font-size="10" font-family="JetBrains Mono, monospace" text-anchor="middle">{k.label}</text>
        {/each}
        {#if view.line}<polyline points={view.line} fill="none" stroke="var(--border-hi)" stroke-width="1.5" stroke-linejoin="round" />{/if}
        {#each view.points as p}
          {@const r = 3 + p.t * 3.5}
          {@const c = heatColor(p.t)}
          {#if p.t > 0.6}<circle cx={p.cx} cy={p.cy} r={r + 4} fill={c} opacity={(p.t - 0.6) * 0.5} />{/if}
          <circle cx={p.cx} cy={p.cy} {r} fill={c} opacity={0.35 + p.t * 0.65}><title>{p.tip}</title></circle>
          {#if !p.hit}<circle cx={p.cx} cy={p.cy} {r} fill="none" stroke="var(--bg)" stroke-width="1.5" />{/if}
        {/each}
      </svg>
      <div class="scale">
        <span>OLD</span>
        <div style="background:linear-gradient(90deg, rgb(43,79,122) 0%, rgb(120,120,130) 45%, rgb(222,138,60) 75%, rgb(242,91,42) 100%)"></div>
        <span>NEW</span>
      </div>
      <div class="legend">
        <div><i></i><Label size={8} color="var(--text-low)">{view.byDate ? 'All hit' : 'Hit goal'}</Label></div>
        <div><i style="box-shadow:inset 0 0 0 1.5px var(--bg)"></i><Label size={8} color="var(--text-low)">{view.byDate ? 'Missed a set' : 'Missed'}</Label></div>
        <div class="pct"><Label size={8} color="var(--text-low)">{data.hitPct}% hit</Label></div>
      </div>
      {#if data.needsWeighIn}<p class="hint">Log a weigh-in to chart volume for bodyweight moves.</p>{/if}
    </div>

    <div class="chart"><VolumeHeatmap {exerciseId} title="Volume calendar" /></div>

    <div>
      <Label>Recent sets</Label>
      <div class="recent">
        {#each data.sets.slice(-6).reverse() as s}
          <div>
            <i style:background={heatColor(s.t)}></i>
            <span class="date">{s.date}</span>
            <BigNum size={16}>{s.reps}</BigNum><span class="x">×</span><BigNum size={16}>{toUnit(s.weight)}</BigNum>
            <Label size={9} color="var(--text-low)">{unit()}</Label>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .empty { padding: 24px; text-align: center; color: var(--text-mid); }
  .empty div { margin-top: 12px; font-family: var(--f-sans); font-size: 13px; }
  .empty strong { color: var(--text); }
  .wrap { padding: 16px 18px 24px; display: flex; flex-direction: column; gap: 16px; }
  .chart { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .pill button { padding: 6px 10px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .chart-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  svg { display: block; }
  .scale { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .scale span { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 1px; }
  .scale div { flex: 1; height: 6px; border-radius: 3px; }
  .legend { margin-top: 6px; display: flex; gap: 14px; }
  .legend div { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
  .legend i { width: 8px; height: 8px; border-radius: 4px; background: var(--text); }
  .legend .pct { margin-left: auto; }
  .hint { margin: 10px 0 0; font-family: var(--f-sans); font-size: 12px; color: var(--text-mid); line-height: 1.4; }
  .recent { margin-top: 8px; display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .recent > div { background: var(--surface); padding: 8px 12px; display: flex; align-items: center; gap: 10px; }
  .recent i { width: 8px; height: 8px; border-radius: 4px; }
  .date { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); letter-spacing: 0.5px; flex: 1; }
  .x { color: var(--text-low); padding: 0 2px; }
</style>
