<script lang="ts">
  // Dashboard: the subscribed plans' exercises ranked by volume (weight × reps) over the last 8 weeks, as two line
  // charts — the 3 with the most volume and the 3 with the least — one line per exercise, volume per training day.
  import Label from './Label.svelte';
  import { addDays, mondayOf, parseYmd, ymd } from '../dates';
  import { store } from '../store.svelte';
  import { toUnit, unit } from '../units';
  import { volumeByDate, planExerciseIds, fmtVol } from '../volume';
  import { MUSCLES, groupOf, libraryHref } from '../muscles';

  const WEEKS = 8, DAY = 864e5;
  const W = 320, H = 170, padL = 38, padR = 10, padT = 10, padB = 22, inset = 6;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  // 1 / 2 / 2.5 / 5 × 10ⁿ tick steps.
  const niceStep = (raw: number) => {
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    return [1, 2, 2.5, 5, 10].find((f) => raw / mag <= f)! * mag;
  };

  type Series = { id: string; name: string; groups: string[]; total: number; days: { ds: string; t: number; vol: number }[] };
  type Chart = { key: string; title: string; series: Series[] };

  const ranked = $derived.by(() => {
    const to = store.todayStr, from = ymd(addDays(store.today, -(WEEKS * 7 - 1)));
    const ids = planExerciseIds(true);
    const all = ids.map((id): Series => {
      const days = [...volumeByDate(from, to, id)].map(([ds, v]) => ({ ds, t: parseYmd(ds).getTime(), vol: toUnit(v.vol, 0) }))
        .sort((a, b) => a.t - b.t);
      const ex = store.exercise(id);
      const groups = [...new Set((ex?.muscles.primary ?? []).map(groupOf))].filter((g) => MUSCLES[g]);
      return { id, name: ex?.name ?? 'Deleted exercise', groups, total: days.reduce((n, d) => n + d.vol, 0), days };
    });
    const trained = all.filter((s) => s.days.length).sort((a, b) => b.total - a.total);
    // Split so the two charts never show the same exercise when the plan has fewer than six trained.
    const nTop = Math.min(3, Math.ceil(trained.length / 2));
    const nLow = Math.min(3, trained.length - nTop);
    return {
      planned: ids.length,
      from: parseYmd(from).getTime(), to: parseYmd(to).getTime(),
      untrained: all.filter((s) => !s.days.length),
      charts: [
        { key: 'most', title: 'Most volume', series: trained.slice(0, nTop) },
        { key: 'least', title: 'Least volume', series: nLow ? trained.slice(-nLow).reverse() : [] }
      ] as Chart[]
    };
  });

  function layout(c: Chart) {
    const { from, to } = ranked;
    const sx = (t: number) => padL + inset + ((t - from) / (to - from)) * (plotW - 2 * inset);
    const maxY = Math.max(1, ...c.series.flatMap((s) => s.days.map((d) => d.vol)));
    const step = niceStep(maxY / 3);
    const yHi = Math.ceil((maxY * 1.08) / step) * step;
    const sy = (v: number) => padT + plotH - (v / yHi) * plotH;
    const yTicks = Array.from({ length: Math.round(yHi / step) + 1 }, (_, i) => i * step).map((v) => ({ y: sy(v), label: fmtVol(v) }));
    // Every other Monday, ending at this week.
    const xTicks: { x: number; label: string }[] = [];
    for (let d = mondayOf(new Date(to)); d.getTime() >= from; d = addDays(d, -14)) xTicks.unshift({ x: sx(d.getTime()), label: fmtDay(d) });
    const series = c.series.map((s, i) => ({
      ...s, slot: i + 1,
      pts: s.days.map((d) => ({ ...d, x: sx(d.t), y: sy(d.vol) }))
    }));
    const dates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.ds)))].sort().map((ds) => ({ ds, x: sx(parseYmd(ds).getTime()) }));
    return { series, yTicks, xTicks, dates };
  }

  // Hover / touch crosshair: snaps to the nearest training day shown in that chart.
  let hover = $state<{ key: string; ds: string } | null>(null);
  function track(e: PointerEvent, key: string, dates: { ds: string; x: number }[]) {
    if (!dates.length) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const near = dates.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    hover = { key, ds: near.ds };
  }
</script>

{#each ranked.charts as c (c.key)}
  {#if c.key === 'most' || c.series.length || ranked.untrained.length}
    {@const L = layout(c)}
    {@const hx = hover?.key === c.key ? L.dates.find((d) => d.ds === hover!.ds) : undefined}
    <div class="card box">
      <div class="head">
        <Label>{c.title}</Label>
        <Label size={9} color="var(--text-low)">Plan · {WEEKS} weeks · {unit()}/day</Label>
      </div>

      {#if !ranked.planned}
        <p class="note">Subscribe to a plan with weight exercises to compare their volume.</p>
      {:else if !c.series.length}
        {#if c.key === 'most'}<p class="note">No sets logged for your plan's exercises in the last {WEEKS} weeks.</p>{/if}
      {:else}
        <div class="plot">
          <svg width="100%" viewBox="0 0 {W} {H}" role="img" aria-label="{c.title}: {c.series.map((s) => `${s.name} ${fmtVol(s.total)} ${unit()}`).join(', ')}"
            onpointermove={(e) => track(e, c.key, L.dates)} onpointerdown={(e) => track(e, c.key, L.dates)}
            onpointerleave={(e) => { if (e.pointerType === 'mouse') hover = null; }}>
            {#each L.yTicks as t (t.label)}
              <line x1={padL} x2={W - padR} y1={t.y} y2={t.y} stroke="var(--border)" stroke-dasharray={t.y === H - padB ? '' : '2 3'} />
              <text x={padL - 6} y={t.y + 3} class="ax" text-anchor="end">{t.label}</text>
            {/each}
            {#each L.xTicks as t (t.label)}
              <text x={t.x} y={H - padB + 14} class="ax" text-anchor={t.x > W - padR - 22 ? 'end' : t.x < padL + 22 ? 'start' : 'middle'}>{t.label}</text>
            {/each}
            {#if hx}<line x1={hx.x} x2={hx.x} y1={padT} y2={H - padB} stroke="var(--text-low)" stroke-width="1" />{/if}
            {#each L.series as s (s.id)}
              {#if s.pts.length > 1}
                <polyline points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--series-{s.slot})" stroke-width="2"
                  stroke-linejoin="round" stroke-linecap="round" />
              {/if}
              {#each s.pts as p (p.ds)}
                <circle cx={p.x} cy={p.y} r={hx?.ds === p.ds ? 5 : 3.5} fill="var(--series-{s.slot})" stroke="var(--surface)" stroke-width="2" />
              {/each}
            {/each}
          </svg>
          {#if hx}
            <div class="tip" style:left="{(hx.x / W) * 100}%" class:right={hx.x > W * 0.6}>
              <div class="tip-date">{fmtDay(parseYmd(hx.ds))}</div>
              {#each L.series as s (s.id)}
                {@const p = s.pts.find((q) => q.ds === hx.ds)}
                {#if p}<div class="tip-row"><i style:background="var(--series-{s.slot})"></i><span>{s.name}</span><b>{fmtVol(p.vol)}</b></div>{/if}
              {/each}
            </div>
          {/if}
        </div>

        <div class="legend">
          {#each L.series as s (s.id)}
            <div>
              <div class="row"><i style:background="var(--series-{s.slot})"></i><span class="name">{s.name}</span><span class="tot">{fmtVol(s.total)} {unit()}</span></div>
              {#if c.key === 'least' && s.groups.length}
                <div class="find">{#each s.groups as g (g)}<a class="chip" href={libraryHref(g)}>{MUSCLES[g]} exercises</a>{/each}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if c.key === 'least' && ranked.untrained.length}
        <p class="note">Not trained in {WEEKS} weeks:</p>
        <div class="find">
          {#each ranked.untrained as s (s.id)}
            {#if s.groups.length}<a class="chip" href={libraryHref(s.groups[0])}>{s.name}</a>{:else}<span class="chip off">{s.name}</span>{/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/each}

<style>
  .box { padding: 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .plot { position: relative; }
  svg { display: block; touch-action: pan-y; }
  .ax { fill: var(--text-low); font-size: 10px; font-family: var(--f-mono); }
  .tip { position: absolute; top: 0; transform: translateX(8px); pointer-events: none; z-index: 2; min-width: 120px; max-width: 70%;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: 8px; padding: 6px 8px; box-shadow: var(--shadow); }
  .tip.right { transform: translateX(calc(-100% - 8px)); }
  .tip-date { font-family: var(--f-mono); font-size: 11px; color: var(--text-mid); letter-spacing: 0.5px; margin-bottom: 4px; }
  .tip-row { display: flex; align-items: center; gap: 6px; font-family: var(--f-sans); font-size: 12px; color: var(--text); }
  .tip-row span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tip-row b { font-family: var(--f-cond); font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
  i { width: 10px; height: 10px; border-radius: 5px; flex-shrink: 0; }
  .legend { margin-top: 10px; display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .legend > div { background: var(--surface); padding: 8px 10px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .find { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 5px 9px; border: 1px solid var(--border-hi); border-radius: 8px; color: var(--text); text-decoration: none;
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .chip:hover { background: var(--surface-hi); }
  .chip.off { color: var(--text-low); border-style: dashed; }
  .name { flex: 1; min-width: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tot { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); letter-spacing: 0.5px; }
  .note { margin: 8px 0 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
</style>
