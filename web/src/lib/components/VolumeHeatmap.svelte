<script lang="ts">
  // Calendar heat graph of training per day — volume (weight × reps), weight lifted, or reps — one column per week
  // (Mon-first), as many weeks as fit the card, ending this week. Whole log, or one exercise with `exerciseId`.
  import Label from './Label.svelte';
  import { heatColor } from '../heat';
  import { addDays, mondayOf, parseYmd, ymd } from '../dates';
  import { store } from '../store.svelte';
  import { toUnit, unit } from '../units';
  import { volumeByDate, fmtVol, dayMetric, HEAT_METRICS, type HeatMetric } from '../volume';

  let { exerciseId, title = 'Volume · per day' }: { exerciseId?: string; title?: string } = $props();

  // Metric choice is remembered per viewer (shared by every calendar); storage can be unavailable (private mode, SSR).
  const KEY = 'tt-cal-metric';
  const readMetric = (): HeatMetric => {
    try { const v = localStorage.getItem(KEY); return HEAT_METRICS.some((m) => m.key === v) ? (v as HeatMetric) : 'volume'; } catch { return 'volume'; }
  };
  let metric = $state<HeatMetric>(readMetric());
  const setMetric = (m: HeatMetric) => { metric = m; picked = null; try { localStorage.setItem(KEY, m); } catch { /* private mode */ } };
  const isReps = $derived(metric === 'reps');
  // A metric total as text: reps is a count, volume/weight carry the weight unit.
  const show = (n: number) => (isReps ? `${fmtVol(n)} reps` : `${fmtVol(toUnit(n, 0))} ${unit()}`);
  // Swap the leading word of the passed title to match the metric ("Volume calendar" → "Reps calendar").
  const METRIC_WORD: Record<HeatMetric, string> = { volume: 'Volume', weight: 'Weight', reps: 'Reps' };
  const heading = $derived(title.replace(/volume/i, METRIC_WORD[metric]));

  const CELL = 13, GAP = 3, PITCH = CELL + GAP, LEFT = 14, TOP = 14;
  let width = $state(0);
  const weeks = $derived(width ? Math.max(8, Math.min(53, Math.floor((width - LEFT + GAP) / PITCH))) : 18);

  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

  const grid = $derived.by(() => {
    const todayStr = store.todayStr;
    const start = addDays(mondayOf(store.today), -(weeks - 1) * 7);
    const byDate = volumeByDate(ymd(start), todayStr, exerciseId);
    // Scale to the 95th-percentile day so one huge session doesn't wash the rest out.
    const vals = [...byDate.values()].map((d) => dayMetric(d, metric)).filter((v) => v > 0).sort((a, b) => a - b);
    const cap = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] : 1;
    const cells: { ds: string; x: number; y: number; m: number; sessions: number; sets: number; fill: string; today: boolean }[] = [];
    const months: { x: number; label: string }[] = [];
    for (let w = 0; w < weeks; w++) {
      for (let r = 0; r < 7; r++) {
        const d = addDays(start, w * 7 + r), ds = ymd(d);
        if (ds > todayStr) break;
        if (d.getDate() === 1 || (w === 0 && r === 0)) months.push({ x: LEFT + w * PITCH, label: fmtMonth(d) });
        const v = byDate.get(ds);
        const m = v ? dayMetric(v, metric) : 0;
        const fill = !v ? 'var(--border)' : !m ? 'var(--mid)' : heatColor(0.12 + 0.88 * Math.min(1, m / cap));
        cells.push({ ds, x: LEFT + w * PITCH, y: TOP + r * PITCH, m, sessions: v?.sessions ?? 0, sets: v?.sets ?? 0, fill, today: ds === todayStr });
      }
    }
    // A month label needs ~3 columns; drop the first one when the next month starts right after it.
    if (months.length > 1 && months[1].x - months[0].x < PITCH * 3) months.shift();
    const total = vals.reduce((n, v) => n + v, 0);
    return { cells, months, total, days: byDate.size, w: LEFT + weeks * PITCH - GAP, h: TOP + 7 * PITCH - GAP };
  });

  let picked = $state<string | null>(null);
  // Tap / hover target: the cell under the pointer, gaps included.
  const cellAt = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * grid.w, y = ((e.clientY - r.top) / r.height) * grid.h;
    const cx = LEFT + Math.floor((x - LEFT) / PITCH) * PITCH, cy = TOP + Math.floor((y - TOP) / PITCH) * PITCH;
    return grid.cells.find((c) => c.x === cx && c.y === cy);
  };
  const sel = $derived(grid.cells.find((c) => c.ds === picked));
</script>

<div class="wrap" bind:clientWidth={width}>
  <div class="head">
    <Label>{heading}</Label>
    <div class="hctl">
      <div class="pill" role="radiogroup" aria-label="Calendar metric">
        {#each HEAT_METRICS as m (m.key)}
          <button role="radio" aria-checked={metric === m.key} class:on={metric === m.key} onclick={() => setMetric(m.key)}>{m.label}</button>
        {/each}
      </div>
      <Label size={9} color="var(--text-low)">{weeks} wks</Label>
    </div>
  </div>

  <div class="readout" aria-live="polite">
    {#if sel}
      <span class="date">{fmtDay(parseYmd(sel.ds))}</span>
      {#if sel.sets}
        <span class="val">{sel.m ? show(sel.m) : isReps ? 'No reps' : 'No load'}</span>
        <span class="meta">{sel.sets} set{sel.sets === 1 ? '' : 's'}{exerciseId ? '' : ` · ${sel.sessions} session${sel.sessions === 1 ? '' : 's'}`}</span>
      {:else}
        <span class="meta">Rest</span>
      {/if}
    {:else}
      <span class="val">{show(grid.total)}</span>
      <span class="meta">{grid.days} day{grid.days === 1 ? '' : 's'} trained · tap a day</span>
    {/if}
  </div>

  <svg width={grid.w} height={grid.h} viewBox="0 0 {grid.w} {grid.h}" role="img"
    aria-label="{heading}: {show(grid.total)} over {grid.days} training days in the last {weeks} weeks"
    onpointermove={(e) => { if (e.pointerType === 'mouse') picked = cellAt(e)?.ds ?? picked; }}
    onpointerdown={(e) => { const c = cellAt(e); picked = !c || c.ds === picked ? null : c.ds; }}>
    {#each grid.months as m (m.x)}
      <text x={m.x} y={TOP - 5} class="ax">{m.label}</text>
    {/each}
    {#each ['M', 'W', 'F'] as d, i (d)}
      <text x={0} y={TOP + i * 2 * PITCH + CELL - 3} class="ax">{d}</text>
    {/each}
    {#each grid.cells as c (c.ds)}
      <rect x={c.x} y={c.y} width={CELL} height={CELL} rx="2" fill={c.fill} opacity={c.sets ? 1 : 0.5}
        stroke={c.ds === picked ? 'var(--text)' : c.today ? 'var(--text-low)' : 'none'} stroke-width="1.5">
        <title>{c.ds}: {c.sets ? show(c.m) : 'rest'}</title>
      </rect>
    {/each}
  </svg>

  <div class="scale">
    <span>LESS</span>
    <div style="background:linear-gradient(90deg, {heatColor(0.12)} 0%, {heatColor(0.45)} 40%, {heatColor(0.75)} 70%, {heatColor(1)} 100%)"></div>
    <span>MORE</span>
  </div>
</div>

<style>
  .wrap { min-width: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .hctl { display: flex; align-items: center; gap: 8px; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .pill button { padding: 4px 9px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .readout { margin: 8px 0 10px; min-height: 22px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .date { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); letter-spacing: 0.5px; }
  .val { font-family: var(--f-cond); font-weight: 700; font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; }
  .meta { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 0.5px; }
  svg { display: block; max-width: 100%; touch-action: manipulation; }
  svg { cursor: pointer; }
  .ax { fill: var(--text-low); font-size: 9px; font-family: var(--f-mono); letter-spacing: 0.5px; }
  .scale { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .scale span { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 1px; }
  .scale div { flex: 1; height: 6px; border-radius: 3px; }
</style>
