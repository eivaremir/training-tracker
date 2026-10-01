<script lang="ts">
  // Per-exercise scatter: weight over cumulative logged sets, coloured by recency (old = cold, recent = hot).
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import { heatColor } from '../heat';
  import { store } from '../store.svelte';

  let { exerciseId }: { exerciseId: string } = $props();
  const ex = $derived(store.exercise(exerciseId));

  const W = 320, H = 200, padL = 32, padR = 12, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const view = $derived.by(() => {
    const logs = store.sessions
      .flatMap((s) => s.logs.filter((l) => l.exerciseId === exerciseId && l.actual).map((l) => ({ ...l, date: s.date })))
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    const n = logs.length;
    if (!n) return null;
    const points = logs.map((l, i) => ({ x: i + 1, y: l.actual!.weight, reps: l.actual!.reps, hit: l.hitGoal, date: l.date, t: n === 1 ? 1 : i / (n - 1) }));
    const ys = points.map((p) => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const yPad = (maxY - minY) * 0.15 || maxY * 0.1 || 5;
    const yLo = Math.max(0, minY - yPad), yHi = maxY + yPad;
    const maxX = points[n - 1].x;
    return {
      n, points, maxX, yLo, yHi,
      yTicks: [yLo, (yLo + yHi) / 2, yHi].map((v) => Math.round(v * 10) / 10),
      kpis: [
        { label: 'Sets', value: n, suffix: '' },
        { label: 'PR', value: maxY, suffix: 'kg' },
        { label: 'Last', value: points[n - 1].y, suffix: 'kg' },
        { label: 'Hit', value: Math.round((logs.filter((l) => l.hitGoal).length / n) * 100), suffix: '%' }
      ]
    };
  });

  const sx = (x: number) => padL + (x / view!.maxX) * plotW;
  const sy = (y: number) => padT + plotH - ((y - view!.yLo) / (view!.yHi - view!.yLo || 1)) * plotH;
</script>

{#if !view}
  <div class="empty">
    <Icon name="chart" size={28} />
    <div>No logged sets yet for <strong>{ex?.name}</strong>.</div>
  </div>
{:else}
  <div class="wrap">
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);border-radius:10px">
      {#each view.kpis as k (k.label)}
        <div style="padding:10px 8px">
          <Label size={8} color="var(--text-low)">{k.label}</Label>
          <div style="margin-top:2px"><BigNum size={20}>{k.value}</BigNum>{#if k.suffix}<span class="suffix" style="font-size:11px;margin-left:1px">{k.suffix}</span>{/if}</div>
        </div>
      {/each}
    </div>

    <div class="chart">
      <div class="chart-head"><Label>Weight × Sets logged</Label><Label size={9} color="var(--text-low)">recent = hot</Label></div>
      <svg width="100%" viewBox="0 0 {W} {H}" role="img" aria-label="Weight per logged set over time">
        {#each view.yTicks as v}
          <line x1={padL} x2={W - padR} y1={sy(v)} y2={sy(v)} stroke="var(--border)" stroke-dasharray="2 3" />
          <text x={padL - 6} y={sy(v) + 3} fill="var(--text-low)" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="end">{v}</text>
        {/each}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--border)" />
        <text x={padL} y={H - padB + 14} fill="var(--text-low)" font-size="8" font-family="JetBrains Mono, monospace">1</text>
        <text x={W - padR} y={H - padB + 14} fill="var(--text-low)" font-size="8" font-family="JetBrains Mono, monospace" text-anchor="end">{view.maxX}</text>
        <text x={(padL + W - padR) / 2} y={H - padB + 14} fill="var(--text-low)" font-size="8" font-family="JetBrains Mono, monospace" text-anchor="middle">SET #</text>
        {#each view.points as p}
          {@const r = 3 + p.t * 3.5}
          {@const c = heatColor(p.t)}
          {#if p.t > 0.6}<circle cx={sx(p.x)} cy={sy(p.y)} r={r + 4} fill={c} opacity={(p.t - 0.6) * 0.5} />{/if}
          <circle cx={sx(p.x)} cy={sy(p.y)} {r} fill={c} opacity={0.35 + p.t * 0.65}><title>{p.date}: {p.reps}×{p.y}kg</title></circle>
          {#if !p.hit}<circle cx={sx(p.x)} cy={sy(p.y)} {r} fill="none" stroke="var(--bg)" stroke-width="1.5" />{/if}
        {/each}
      </svg>
      <div class="scale">
        <span>OLD</span>
        <div style="background:linear-gradient(90deg, rgb(43,79,122) 0%, rgb(120,120,130) 45%, rgb(222,138,60) 75%, rgb(242,91,42) 100%)"></div>
        <span>NEW</span>
      </div>
      <div class="legend">
        <div><i></i><Label size={8} color="var(--text-low)">Hit goal</Label></div>
        <div><i style="box-shadow:inset 0 0 0 1.5px var(--bg)"></i><Label size={8} color="var(--text-low)">Missed</Label></div>
      </div>
    </div>

    <div>
      <Label>Recent sets</Label>
      <div class="recent">
        {#each view.points.slice(-6).reverse() as p}
          <div>
            <i style:background={heatColor(p.t)}></i>
            <span class="date">{p.date}</span>
            <BigNum size={16}>{p.reps}</BigNum><span class="x">×</span><BigNum size={16}>{p.y}</BigNum>
            <Label size={9} color="var(--text-low)">kg</Label>
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
  .chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  svg { display: block; }
  .scale { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
  .scale span { font-family: var(--f-mono); font-size: 9px; color: var(--text-low); letter-spacing: 1px; }
  .scale div { flex: 1; height: 6px; border-radius: 3px; }
  .legend { margin-top: 6px; display: flex; gap: 14px; }
  .legend div { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 8px; height: 8px; border-radius: 4px; background: var(--text); }
  .recent { margin-top: 8px; display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .recent > div { background: var(--surface); padding: 8px 12px; display: flex; align-items: center; gap: 10px; }
  .recent i { width: 8px; height: 8px; border-radius: 4px; }
  .date { font-family: var(--f-mono); font-size: 10px; color: var(--text-mid); letter-spacing: 0.5px; flex: 1; }
  .x { color: var(--text-low); padding: 0 2px; }
</style>
