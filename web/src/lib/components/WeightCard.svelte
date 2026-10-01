<script lang="ts">
  // Body-weight trend with goal line, latest value, 30-day change and distance to goal.
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import Sheet from './Sheet.svelte';
  import WeightSheet from './WeightSheet.svelte';
  import { store } from '../store.svelte';
  import { addDays, parseYmd, ymd } from '../dates';

  let { compact = false, days = 90 }: { compact?: boolean; days?: number } = $props();
  let logging = $state(false);

  const goal = $derived(store.settings.weightGoalKg);
  const all = $derived(store.weights);
  const latest = $derived(all.at(-1));
  const recent = $derived(all.filter((w) => w.date >= ymd(addDays(store.today, -(days - 1)))));
  const monthAgo = $derived([...all].reverse().find((w) => w.date <= ymd(addDays(store.today, -30))));
  const change = $derived(latest && monthAgo ? Math.round((latest.kg - monthAgo.kg) * 10) / 10 : null);
  const toGoal = $derived(latest && goal != null ? Math.round((goal - latest.kg) * 10) / 10 : null);
  // Progress from the first recorded weight toward the goal.
  const progress = $derived.by(() => {
    if (goal == null || !latest || all.length < 2) return null;
    const start = all[0].kg;
    if (start === goal) return 1;
    return Math.max(0, Math.min(1, (start - latest.kg) / (start - goal)));
  });

  const W = 320, H = 110, P = 8;
  const chart = $derived.by(() => {
    if (recent.length < 2) return null;
    const t0 = parseYmd(recent[0].date).getTime(), t1 = parseYmd(recent.at(-1)!.date).getTime() || t0 + 1;
    const vals = recent.map((w) => w.kg).concat(goal != null ? [goal] : []);
    const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
    const x = (d: string) => P + ((parseYmd(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const y = (kg: number) => P + (1 - (kg - lo) / (hi - lo)) * (H - 2 * P);
    return {
      line: recent.map((w) => `${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' '),
      dots: recent.map((w) => ({ cx: x(w.date), cy: y(w.kg), label: `${w.date}: ${w.kg} kg` })),
      goalY: goal != null ? y(goal) : null, lo, hi
    };
  });
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
</script>

<div class="card box">
  <div class="head">
    <Icon name="chart" size={14} /><Label>Body weight</Label><span style="flex:1"></span>
    <a class="mini-btn" href="/settings#weight">{goal != null ? 'Goal' : 'Set goal'}</a>
    <button class="mini-btn" onclick={() => (logging = true)}><Icon name="plus" size={12} /> Log</button>
  </div>

  {#if !latest}
    <p class="muted">Log your weight to track it{goal != null ? ` against your ${goal} kg goal` : ''}.</p>
  {:else}
    <div class="stats">
      <div><Label size={9} color="var(--text-low)">Latest</Label><div><BigNum size={compact ? 26 : 30}>{latest.kg}</BigNum><span class="u">kg</span></div></div>
      {#if goal != null}
        <div><Label size={9} color="var(--text-low)">Goal</Label><div><BigNum size={compact ? 26 : 30}>{goal}</BigNum><span class="u">kg</span></div></div>
        <div><Label size={9} color="var(--text-low)">To go</Label><div><BigNum size={compact ? 26 : 30}>{toGoal === 0 ? '0' : signed(toGoal!)}</BigNum><span class="u">kg</span></div></div>
      {:else if change != null}
        <div><Label size={9} color="var(--text-low)">30 days</Label><div><BigNum size={compact ? 26 : 30}>{signed(change)}</BigNum><span class="u">kg</span></div></div>
      {/if}
    </div>
    {#if progress != null}
      <div class="track" title="{Math.round(progress * 100)}% of the way to your goal"><div style:width="{progress * 100}%"></div></div>
    {/if}
    {#if !compact}
      {#if chart}
        <svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Body weight over the last {days} days">
          {#if chart.goalY != null}
            <line x1={P} x2={W - P} y1={chart.goalY} y2={chart.goalY} stroke="var(--mid)" stroke-dasharray="4 4" />
            <text x={W - P} y={chart.goalY - 4} text-anchor="end" font-size="8" fill="var(--text-low)" font-family="JetBrains Mono, monospace">GOAL {goal}</text>
          {/if}
          <polyline points={chart.line} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" />
          {#each chart.dots as d}<circle cx={d.cx} cy={d.cy} r="2.2" fill="var(--text)"><title>{d.label}</title></circle>{/each}
        </svg>
        <div class="axis"><Label size={8} color="var(--text-low)">{recent[0].date}</Label><Label size={8} color="var(--text-low)">{recent.at(-1)?.date}</Label></div>
      {:else}
        <p class="muted">Log at least two days to see the trend.</p>
      {/if}
      {#if change != null && goal != null}<Label size={9} color="var(--text-low)">{signed(change)} kg in the last 30 days</Label>{/if}
    {/if}
  {/if}
</div>

<Sheet open={logging} onclose={() => (logging = false)} title="Body weight">
  {#if logging}<WeightSheet date={store.todayStr} onclose={() => (logging = false)} />{/if}
</Sheet>

<style>
  .box { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .head a { text-decoration: none; }
  .muted { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .u { color: var(--text-mid); font-family: var(--f-cond); font-size: 13px; margin-left: 2px; }
  .track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; background: var(--text); }
  svg { display: block; }
  .axis { display: flex; justify-content: space-between; margin-top: -4px; }
</style>
