<script lang="ts">
  import { routinesOn } from '$lib/plans';
  // Dashboard — aggregate progress across subscribed plans.
  import { goto } from '$app/navigation';
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import BigNum from '$lib/components/BigNum.svelte';
  import Button from '$lib/components/Button.svelte';
  import BodyHeatMap from '$lib/components/BodyHeatMap.svelte';
  import PlanVolumeCharts from '$lib/components/PlanVolumeCharts.svelte';
  import WeightCard from '$lib/components/WeightCard.svelte';
  import { store } from '$lib/store.svelte';
  import { WEEK_MON, addDays, mondayOf, weekdayKey, ymd } from '$lib/dates';

  const today = store.today;
  const todayStr = ymd(today);
  const wd = weekdayKey(today);
  const dom = today.getDate();
  const monthName = today.toLocaleString('en-US', { month: 'long' }).toUpperCase();
  const monday = mondayOf(today);

  const subscribed = $derived(store.plans.filter((p) => p.subscribed));
  const done = (planId: string, routineId: string, date: string) =>
    store.sessions.find((s) => s.planId === planId && s.routineId === routineId && s.date === date && s.logs.length);

  const planStats = $derived(subscribed.map((p) => {
    let planned = 0, completed = 0, hit = 0, sets = 0;
    // Each scheduled routine counts once, so a day with two routines is two planned workouts.
    const count = (key: string, date: string, past: boolean) => routinesOn(p, key).forEach((rid) => {
      planned++;
      const s = past ? done(p.id, rid, date) : undefined;
      if (!s) return;
      completed++; sets += s.logs.length; hit += s.logs.filter((l) => l.hitGoal).length;
    });
    if (p.kind === 'weekly') {
      WEEK_MON.forEach((d, i) => count(d, ymd(addDays(monday, i)), true));
    } else {
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= lastDay; d++) count(String(d), ymd(new Date(today.getFullYear(), today.getMonth(), d)), d <= dom);
    }
    return { plan: p, planned, completed, completion: planned ? completed / planned : 0, goalPct: sets ? hit / sets : 0 };
  }));

  const kpis = $derived.by(() => {
    const dates = new Set(store.sessions.filter((s) => s.logs.length).map((s) => s.date));
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      if (dates.has(ymd(addDays(today, -i)))) streak++;
      else if (i > 0) break; // today not trained yet doesn't break the streak
    }
    const mon = ymd(monday);
    const week = store.sessions.filter((s) => s.logs.length && s.date >= mon && s.date <= todayStr).length;
    return [
      { label: 'Plans', value: subscribed.length, suffix: '', icon: '' },
      { label: 'Streak', value: streak, suffix: 'd', icon: 'flame' },
      { label: 'This week', value: week, suffix: 'sess', icon: '' }
    ];
  });

  const sessionsOn = (ds: string) => store.sessions.filter((s) => s.date === ds && s.logs.length).length;
  const last14 = $derived(Array.from({ length: 14 }, (_, i) => {
    const ds = ymd(addDays(today, -(13 - i)));
    return { ds, count: sessionsOn(ds) };
  }));

  // Current calendar month as a Mon-first grid; `monthLead` blank cells line day 1 up under its weekday.
  const monthLead = (new Date(today.getFullYear(), today.getMonth(), 1).getDay() + 6) % 7;
  const monthDays = $derived(Array.from({ length: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, i) => {
    const d = i + 1, ds = ymd(new Date(today.getFullYear(), today.getMonth(), d));
    return { d, ds, future: d > dom, count: d > dom ? 0 : sessionsOn(ds) };
  }));
  const monthTrained = $derived(monthDays.filter((c) => c.count).length);

  // Body heat map window, remembered per viewer.
  type HeatRange = '7d' | 'mtd' | 'ytd';
  const HEAT_RANGES: { key: HeatRange; label: string; title: string }[] = [
    { key: '7d', label: '7D', title: 'Last 7 days' },
    { key: 'mtd', label: 'MTD', title: 'Month to date' },
    { key: 'ytd', label: 'YTD', title: 'Year to date' }
  ];
  const HEAT_KEY = 'tt-heat-range';
  let heatRange = $state<HeatRange>((() => {
    try { const v = localStorage.getItem(HEAT_KEY); return HEAT_RANGES.some((r) => r.key === v) ? (v as HeatRange) : '7d'; } catch { return '7d'; }
  })());
  const setHeatRange = (r: HeatRange) => { heatRange = r; try { localStorage.setItem(HEAT_KEY, r); } catch { /* private mode */ } };
  const heatFrom = $derived(
    heatRange === 'ytd' ? ymd(new Date(today.getFullYear(), 0, 1))
    : heatRange === 'mtd' ? ymd(new Date(today.getFullYear(), today.getMonth(), 1))
    : ymd(addDays(today, -6))
  );
</script>

<TopBar title="Dashboard" subtitle="{wd.toUpperCase()} · {monthName} {dom}">
  {#snippet right()}
    <IconButton icon={store.theme === 'dark' ? 'sun' : 'moon'} onclick={() => store.toggleTheme()} label="Toggle theme" />
    <IconButton icon="settings" size={19} label="Settings" onclick={() => goto('/settings')} />
  {/snippet}
</TopBar>

<div class="page r-cols">
  <BodyHeatMap from={heatFrom} to={todayStr}>
    {#snippet controls()}
      <div class="pill" role="radiogroup" aria-label="Heat map range">
        {#each HEAT_RANGES as r (r.key)}
          <button role="radio" aria-checked={heatRange === r.key} class:on={heatRange === r.key} title={r.title} aria-label={r.title}
            onclick={() => setHeatRange(r.key)}>{r.label}</button>
        {/each}
      </div>
    {/snippet}
  </BodyHeatMap>

  <WeightCard compact />

  <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
    {#each kpis as k (k.label)}
      <div style="padding:14px 12px">
        <div style="display:flex;align-items:center;gap:6px">
          {#if k.icon}<Icon name={k.icon} size={11} />{/if}
          <Label size={9} color="var(--text-low)">{k.label}</Label>
        </div>
        <div style="margin-top:6px"><BigNum size={32}>{k.value}</BigNum>{#if k.suffix}<span class="suffix" style="font-size:14px;margin-left:3px">{k.suffix}</span>{/if}</div>
      </div>
    {/each}
  </div>

  <div class="card" style="padding:14px">
    <div class="between" style="align-items:baseline;margin-bottom:12px">
      <Label>Activity · 14 days</Label>
      <Label size={9} color="var(--text-low)">sessions/day</Label>
    </div>
    <div class="strip">
      {#each last14 as c (c.ds)}
        <div title="{c.ds}: {c.count}" style:background={c.count === 0 ? 'var(--border)' : c.count >= 2 ? 'var(--text)' : 'var(--mid)'}
          style:opacity={c.count === 0 ? 0.5 : 1}></div>
      {/each}
    </div>
  </div>

  <div class="card" style="padding:14px">
    <div class="between" style="align-items:baseline;margin-bottom:12px">
      <Label>Activity · {monthName}</Label>
      <Label size={9} color="var(--text-low)">{monthTrained}/{dom} days</Label>
    </div>
    <div class="month">
      {#each WEEK_MON as w (w)}<span class="wd">{w.slice(0, 1)}</span>{/each}
      {#each { length: monthLead }, i (i)}<span></span>{/each}
      {#each monthDays as c (c.ds)}
        <div class="day" class:l1={c.count === 1} class:l2={c.count >= 2} class:future={c.future} class:today={c.ds === todayStr}
          title={c.future ? c.ds : `${c.ds}: ${c.count}`}>{c.d}</div>
      {/each}
    </div>
  </div>

  <PlanVolumeCharts />

  <div>
    <div class="between" style="margin-bottom:10px">
      <Label>Plans</Label>
      <a class="manage" href="/plans">Manage <Icon name="chev-r" size={12} /></a>
    </div>
    <div class="col">
      {#each planStats as ps (ps.plan.id)}
        <a class="plan card" href="/plans">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="chip-kind">{ps.plan.kind}</div>
            <div class="cond" style="font-size:16px;flex:1">{ps.plan.name}</div>
            <Icon name="chev-r" size={14} />
          </div>
          <div style="display:flex;align-items:flex-end;gap:16px">
            <div style="flex:1">
              <Label size={9} color="var(--text-low)">{ps.plan.kind === 'weekly' ? 'This week' : 'This month'}</Label>
              <div style="margin-top:2px">
                <BigNum size={22}>{ps.completed}</BigNum><span class="slash">/</span><BigNum size={18} color="var(--text-mid)">{ps.planned}</BigNum>
                <Label size={9} color="var(--text-low)"> done</Label>
              </div>
            </div>
            <div style="flex:1">
              <Label size={9} color="var(--text-low)">Goal hit</Label>
              <div style="margin-top:2px"><BigNum size={22}>{Math.round(ps.goalPct * 100)}</BigNum><span class="suffix" style="font-size:14px;margin-left:1px">%</span></div>
            </div>
          </div>
          <div class="track"><div style:width="{ps.completion * 100}%"></div></div>
        </a>
      {/each}
      {#if !planStats.length}
        <Button variant="secondary" full icon="cal" onclick={() => goto('/plans')}>Subscribe to a plan</Button>
      {/if}
    </div>
  </div>
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .between { display: flex; align-items: center; justify-content: space-between; }
  .col { display: flex; flex-direction: column; gap: 8px; }
  .strip { display: flex; align-items: flex-end; gap: 4px; height: 50px; }
  .strip div { flex: 1; height: 36px; border-radius: 3px; }
  /* Month grid: same scale as the strip — border (none, at 50%), mid (1), text (2+). */
  .month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .wd { text-align: center; font-family: var(--f-mono); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-low); padding-bottom: 2px; }
  .day { height: 30px; border-radius: 3px; display: flex; align-items: center; justify-content: center;
    font-family: var(--f-mono); font-size: 11px; color: var(--text-low); background: color-mix(in srgb, var(--border) 50%, transparent); }
  .day.l1 { background: var(--mid); color: var(--text); }
  .day.l2 { background: var(--text); color: var(--bg); }
  .day.future { background: transparent; border: 1px dashed var(--border); opacity: 0.5; }
  .day.today { outline: 1.5px solid var(--text); outline-offset: 2px; color: var(--text); }
  .day.today.l2 { color: var(--bg); }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; flex-shrink: 0; }
  .pill button { padding: 5px 10px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .manage { color: var(--text-mid); font-family: var(--f-mono); font-size: 12px; letter-spacing: 1px; text-transform: uppercase;
    display: flex; align-items: center; gap: 4px; text-decoration: none; }
  .plan { width: 100%; padding: 14px; display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: var(--text); }
  .slash { color: var(--text-low); padding: 0 3px; font-family: var(--f-cond); }
  .track { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; background: var(--text); }
</style>
