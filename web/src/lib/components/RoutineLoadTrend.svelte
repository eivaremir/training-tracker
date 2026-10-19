<script lang="ts">
  // Total load (weight × reps) for one routine, one point per historical execution (same routineId),
  // plotted by date. Matches the app's SVG line-chart style (see VolumeTrend.svelte).
  import Label from './Label.svelte';
  import { parseYmd } from '../dates';
  import { store } from '../store.svelte';
  import { toUnit, unit } from '../units';
  import { setVolumeKg, tracksVolume, fmtVol } from '../volume';
  import { fmtDay, niceStep } from '../chart';

  let { routineId, routineName, planName }: { routineId: string; routineName?: string; planName?: string } = $props();

  const W = 320, H = 180, padL = 38, padR = 12, padT = 12, padB = 22, inset = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  type Pt = { key: string; t: number; vol: number; sets: number; label: string };

  const view = $derived.by(() => {
    const pts: Pt[] = store.sessions
      .filter((s) => s.routineId === routineId && s.logs.some((l) => l.actual))
      .map((s) => {
        let kg = 0, sets = 0;
        for (const l of s.logs) {
          if (!l.actual) continue;
          const ex = store.exercise(l.exerciseId);
          if (tracksVolume(ex)) kg += setVolumeKg(l, ex);
          sets++;
        }
        return { key: s.id, t: parseYmd(s.date).getTime(), vol: toUnit(kg, 0), sets,
          label: parseYmd(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() };
      })
      .sort((a, b) => a.t - b.t);
    if (!pts.some((p) => p.vol > 0)) return null;

    const lo = pts[0].t, hi = pts.at(-1)!.t;
    const single = lo === hi;
    const sx = (t: number) => (single ? padL + plotW / 2 : padL + inset + ((t - lo) / (hi - lo)) * (plotW - 2 * inset));
    const maxY = Math.max(1, ...pts.map((p) => p.vol));
    const step = niceStep(maxY / 3);
    const yHi = Math.ceil((maxY * 1.08) / step) * step;
    const sy = (v: number) => padT + plotH - (v / yHi) * plotH;
    const yTicks = Array.from({ length: Math.round(yHi / step) + 1 }, (_, i) => i * step).map((v) => ({ y: sy(v), label: fmtVol(v) }));

    const xTicks: { x: number; label: string }[] = [];
    if (single) {
      xTicks.push({ x: sx(lo), label: fmtDay(new Date(pts[0].t)) });
    } else {
      // First and last execution, plus a midpoint, as dates.
      const marks = pts.length <= 3 ? pts : [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts.at(-1)!];
      for (const p of marks) xTicks.push({ x: sx(p.t), label: fmtDay(new Date(p.t)) });
    }

    const total = pts.reduce((n, p) => n + p.vol, 0);
    const avg = Math.round(total / pts.length);
    const best = pts.reduce((a, b) => (b.vol > a.vol ? b : a));
    const xy = pts.map((p) => ({ ...p, x: sx(p.t), y: sy(p.vol) }));
    return { pts: xy, yTicks, xTicks, total, avg, best, base: H - padB, count: pts.length };
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

<div class="wrap">
  <div class="head">
    <Label>Routine load · per execution</Label>
    {#if routineName}<Label size={9} color="var(--text-low)">{routineName}{planName ? ` · ${planName}` : ''}</Label>{/if}
  </div>

  {#if !view}
    <p class="note">No weighted sets logged for this routine yet. Finish a set to start the trend.</p>
  {:else}
    <div class="readout" aria-live="polite">
      {#if sel}
        <span class="date">{sel.label}</span>
        <span class="val">{sel.vol ? `${fmtVol(sel.vol)} ${unit()}` : 'No load'}</span>
        <span class="meta">{sel.sets} set{sel.sets === 1 ? '' : 's'}</span>
      {:else}
        <span class="val">{fmtVol(view.avg)} {unit()}</span>
        <span class="meta">avg over {view.count} execution{view.count === 1 ? '' : 's'} · best {fmtVol(view.best.vol)}</span>
      {/if}
    </div>

    <svg width="100%" viewBox="0 0 {W} {H}" role="img"
      aria-label="Routine total load per execution: {view.count} executions, best {fmtVol(view.best.vol)} {unit()} on {view.best.label}"
      onpointermove={track} onpointerdown={track} onpointerleave={(e) => { if (e.pointerType === 'mouse') picked = null; }}>
      {#each view.yTicks as t (t.label)}
        <line x1={padL} x2={W - padR} y1={t.y} y2={t.y} stroke="var(--border)" stroke-dasharray={t.y === view.base ? '' : '2 3'} />
        <text x={padL - 6} y={t.y + 3} class="ax" text-anchor="end">{t.label}</text>
      {/each}
      {#each view.xTicks as t (t.x + t.label)}
        <text x={t.x} y={H - padB + 14} class="ax" text-anchor={t.x > W - padR - 22 ? 'end' : t.x < padL + 22 ? 'start' : 'middle'}>{t.label}</text>
      {/each}
      {#if sel}<line x1={sel.x} x2={sel.x} y1={padT} y2={view.base} stroke="var(--text-low)" stroke-width="1" />{/if}
      {#if view.pts.length > 1}
        <polyline points={view.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--text)" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round" />
      {/if}
      {#each view.pts as p (p.key)}
        <circle cx={p.x} cy={p.y} r={p.key === picked ? 5 : 3.5} fill="var(--text)" stroke="var(--surface)" stroke-width="2" />
      {/each}
    </svg>
  {/if}
</div>

<style>
  .wrap { padding: 18px; }
  .head { display: flex; flex-direction: column; gap: 2px; }
  .readout { margin: 10px 0 6px; min-height: 22px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .date { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); letter-spacing: 0.5px; }
  .val { font-family: var(--f-cond); font-weight: 700; font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; }
  .meta { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); letter-spacing: 0.5px; }
  svg { display: block; touch-action: pan-y; cursor: crosshair; }
  .ax { fill: var(--text-low); font-size: 10px; font-family: var(--f-mono); }
  .note { margin: 10px 0 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
</style>
