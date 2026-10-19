<script lang="ts">
  // Stats: total volume (weight × reps) over time as a line — per training day over the last 8 weeks, or per
  // calendar week (Mon–Sun) over the last 26. Cardio and stretching add no volume (see lib/volume.ts).
  import Label from './Label.svelte';
  import { addDays, mondayOf, parseYmd, ymd } from '../dates';
  import { store } from '../store.svelte';
  import { toUnit, unit } from '../units';
  import { volumeByDate, fmtVol } from '../volume';
  import { fmtDay, niceStep } from '../chart';

  type Mode = 'day' | 'week';
  const MODES: { key: Mode; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }];
  const KEY = 'tt-volume-trend';
  let mode = $state<Mode>((() => { try { return localStorage.getItem(KEY) === 'week' ? 'week' : 'day'; } catch { return 'day'; } })());
  const setMode = (m: Mode) => { mode = m; picked = null; try { localStorage.setItem(KEY, m); } catch { /* private mode */ } };

  const DAY_WEEKS = 8, WEEK_WEEKS = 26;
  const W = 320, H = 180, padL = 38, padR = 12, padT = 12, padB = 22, inset = 6;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

  type Pt = { key: string; t: number; vol: number; sets: number; label: string };

  const view = $derived.by(() => {
    const today = store.today, todayStr = store.todayStr;
    const thisMon = mondayOf(today);
    const startMon = addDays(thisMon, -(WEEK_WEEKS - 1) * 7);
    const from = mode === 'day' ? ymd(addDays(today, -(DAY_WEEKS * 7 - 1))) : ymd(startMon);
    const byDate = volumeByDate(from, todayStr);

    let pts: Pt[];
    if (mode === 'day') {
      // Training days with load only: rest days aren't zero-volume sessions, so the line skips them.
      pts = [...byDate].filter(([, v]) => v.vol > 0)
        .map(([ds, v]) => ({ key: ds, t: parseYmd(ds).getTime(), vol: toUnit(v.vol, 0), sets: v.sets, label: fmtDay(parseYmd(ds)) }))
        .sort((a, b) => a.t - b.t);
    } else {
      // Every week, empty ones included (a week off is a real zero), from the first logged week — at least 8 shown.
      pts = Array.from({ length: WEEK_WEEKS }, (_, i) => {
        const mon = addDays(startMon, i * 7), lo = ymd(mon), hi = ymd(addDays(mon, 6));
        let kg = 0, sets = 0;
        for (const [ds, v] of byDate) if (ds >= lo && ds <= hi) { kg += v.vol; sets += v.sets; }
        return { key: lo, t: mon.getTime(), vol: toUnit(kg, 0), sets, label: i === WEEK_WEEKS - 1 ? 'THIS WEEK SO FAR' : `WEEK OF ${fmtDay(mon)}` };
      });
      const first = pts.findIndex((p) => p.vol > 0);
      pts = pts.slice(Math.min(Math.max(0, first), WEEK_WEEKS - DAY_WEEKS));
    }
    if (!pts.some((p) => p.vol > 0)) return null;

    const lo = mode === 'day' ? parseYmd(from).getTime() : pts[0].t;
    const hi = mode === 'day' ? parseYmd(todayStr).getTime() : thisMon.getTime();
    const sx = (t: number) => padL + inset + ((t - lo) / (hi - lo || 1)) * (plotW - 2 * inset);
    const maxY = Math.max(1, ...pts.map((p) => p.vol));
    const step = niceStep(maxY / 3);
    const yHi = Math.ceil((maxY * 1.08) / step) * step;
    const sy = (v: number) => padT + plotH - (v / yHi) * plotH;
    const yTicks = Array.from({ length: Math.round(yHi / step) + 1 }, (_, i) => i * step).map((v) => ({ y: sy(v), label: fmtVol(v) }));

    const xTicks: { x: number; label: string }[] = [];
    if (mode === 'day' || pts.length <= 12) {
      // Every other Monday, ending this week.
      for (let d = thisMon; d.getTime() >= lo; d = addDays(d, -14)) xTicks.unshift({ x: sx(d.getTime()), label: fmtDay(d) });
    } else {
      // First Monday of each month, every other month so six months fit.
      const firsts = pts.filter((p, i) => i === 0 || new Date(p.t).getMonth() !== new Date(pts[i - 1].t).getMonth()).slice(1);
      firsts.forEach((p, i) => { if ((firsts.length - 1 - i) % 2 === 0) xTicks.push({ x: sx(p.t), label: fmtMonth(new Date(p.t)) }); });
    }

    const loaded = pts.filter((p) => p.vol > 0);
    const total = pts.reduce((n, p) => n + p.vol, 0);
    // Headline: average per training day, or per full week since the first logged one (this week is still running).
    const sinceFirst = pts.slice(pts.findIndex((p) => p.vol > 0), -1);
    const full = mode === 'week' && sinceFirst.length ? sinceFirst : loaded;
    const avg = full.length ? Math.round(full.reduce((n, p) => n + p.vol, 0) / full.length) : 0;
    const best = loaded.reduce((a, b) => (b.vol > a.vol ? b : a));
    const xy = pts.map((p) => ({ ...p, x: sx(p.t), y: sy(p.vol) }));
    // This week is still running: its point is hollow and joined by a dashed segment.
    const open = mode === 'week' ? xy.at(-1) : undefined;
    return { pts: xy, closed: open ? xy.slice(0, -1) : xy, open, yTicks, xTicks, total, avg, best, base: H - padB, weeks: mode === 'day' ? DAY_WEEKS : pts.length };
  });

  let picked = $state<string | null>(null);
  const sel = $derived(view?.pts.find((p) => p.key === picked));
  function track(e: PointerEvent) {
    if (!view) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    picked = view.pts.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).key;
  }
</script>

<div class="head">
  <Label>Total volume · per {mode}</Label>
  <div class="pill" role="radiogroup" aria-label="Group volume by">
    {#each MODES as m (m.key)}
      <button role="radio" aria-checked={mode === m.key} class:on={mode === m.key} onclick={() => setMode(m.key)}>{m.label}</button>
    {/each}
  </div>
</div>

{#if !view}
  <p class="note">No weighted sets logged in the last {mode === 'day' ? DAY_WEEKS : WEEK_WEEKS} weeks.</p>
{:else}
  <div class="readout" aria-live="polite">
    {#if sel}
      <span class="date">{sel.label}</span>
      <span class="val">{sel.vol ? `${fmtVol(sel.vol)} ${unit()}` : 'No load'}</span>
      <span class="meta">{sel.sets} set{sel.sets === 1 ? '' : 's'}</span>
    {:else}
      <span class="val">{fmtVol(view.avg)} {unit()}</span>
      <span class="meta">avg per {mode === 'day' ? 'training day' : 'week'} · best {fmtVol(view.best.vol)}</span>
    {/if}
  </div>

  <svg width="100%" viewBox="0 0 {W} {H}" role="img"
    aria-label="Total volume per {mode}: {fmtVol(view.total)} {unit()} over the last {view.weeks} weeks, best {fmtVol(view.best.vol)} on {view.best.label}"
    onpointermove={track} onpointerdown={track} onpointerleave={(e) => { if (e.pointerType === 'mouse') picked = null; }}>
    {#each view.yTicks as t (t.label)}
      <line x1={padL} x2={W - padR} y1={t.y} y2={t.y} stroke="var(--border)" stroke-dasharray={t.y === view.base ? '' : '2 3'} />
      <text x={padL - 6} y={t.y + 3} class="ax" text-anchor="end">{t.label}</text>
    {/each}
    {#each view.xTicks as t (t.label)}
      <text x={t.x} y={H - padB + 14} class="ax" text-anchor={t.x > W - padR - 22 ? 'end' : t.x < padL + 22 ? 'start' : 'middle'}>{t.label}</text>
    {/each}
    {#if sel}<line x1={sel.x} x2={sel.x} y1={padT} y2={view.base} stroke="var(--text-low)" stroke-width="1" />{/if}
    {#if view.closed.length > 1}
      <polyline points={view.closed.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--text)" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round" />
    {/if}
    {#if view.open && view.closed.length}
      {@const a = view.closed.at(-1)!}
      <line x1={a.x} y1={a.y} x2={view.open.x} y2={view.open.y} stroke="var(--text-low)" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round" />
    {/if}
    {#each view.closed as p (p.key)}
      <circle cx={p.x} cy={p.y} r={p.key === picked ? 5 : 3.5} fill="var(--text)" stroke="var(--surface)" stroke-width="2" />
    {/each}
    {#if view.open}
      <circle cx={view.open.x} cy={view.open.y} r={view.open.key === picked ? 5 : 3.5} fill="var(--surface)" stroke="var(--text)" stroke-width="1.5" />
    {/if}
  </svg>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .pill button { padding: 5px 10px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .readout { margin: 8px 0 6px; min-height: 22px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .date { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); letter-spacing: 0.5px; }
  .val { font-family: var(--f-cond); font-weight: 700; font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; }
  .meta { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 0.5px; }
  svg { display: block; touch-action: pan-y; cursor: crosshair; }
  .ax { fill: var(--text-low); font-size: 10px; font-family: var(--f-mono); }
  .note { margin: 10px 0 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); }
</style>
