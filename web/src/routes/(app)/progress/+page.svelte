<script lang="ts">
  // Progress — last 28 days of sessions.
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import { goto } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import BigNum from '$lib/components/BigNum.svelte';
  import Button from '$lib/components/Button.svelte';
  import WeightCard from '$lib/components/WeightCard.svelte';
  import VolumeHeatmap from '$lib/components/VolumeHeatmap.svelte';
  import VolumeTrend from '$lib/components/VolumeTrend.svelte';
  import { store } from '$lib/store.svelte';
  import { unit, toUnit } from '$lib/units';
  import { addDays, ymd } from '$lib/dates';

  const cut = ymd(addDays(store.today, -27));
  const sessions = $derived(store.sessions.filter((s) => s.date >= cut && s.logs.length).sort((a, b) => a.date.localeCompare(b.date)));
  const stats = $derived(sessions.map((s) => {
    const total = s.logs.length, hit = s.logs.filter((l) => l.hitGoal).length;
    return { date: s.date, total, hit, pct: total ? hit / total : 0 };
  }));
  const last12 = $derived(stats.slice(-12));
  const avgPct = $derived(stats.length ? stats.reduce((s, x) => s + x.pct, 0) / stats.length : 0);
  const prs = $derived.by(() => {
    const pr: Record<string, number> = {};
    sessions.flatMap((s) => s.logs).forEach((l) => { if (l.actual && l.actual.weight > (pr[l.exerciseId] || 0)) pr[l.exerciseId] = l.actual.weight; });
    return Object.entries(pr).sort((a, b) => b[1] - a[1]).slice(0, 5);
  });
</script>

<TopBar title="Progress" subtitle="LAST 28 DAYS">
  {#snippet right()}<IconButton icon="settings" size={19} label="Settings" onclick={() => goto('/settings')} />{/snippet}
</TopBar>
<div class="page r-cols">
  <WeightCard days={90} />

  <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">
    {#each [{ label: 'Sessions', value: sessions.length, suffix: '' }, { label: 'Avg goal hit', value: Math.round(avgPct * 100), suffix: '%' }, { label: 'Total sets', value: sessions.reduce((s, x) => s + x.logs.length, 0), suffix: '' }] as k (k.label)}
      <div style="padding:14px 12px">
        <Label size={9} color="var(--text-low)">{k.label}</Label>
        <div style="margin-top:6px"><BigNum size={32}>{k.value}</BigNum>{#if k.suffix}<span class="suffix" style="font-size:16px;margin-left:2px">{k.suffix}</span>{/if}</div>
      </div>
    {/each}
  </div>

  <div class="card box"><VolumeTrend /></div>

  <div class="card box"><VolumeHeatmap title="Volume calendar" /></div>

  {#if !sessions.length}
    <div class="card empty">
      <Label color="var(--text-low)">No sessions yet</Label>
      <p>Log a set from the Today tab, or load demo data to explore the charts.</p>
      <Button variant="secondary" size="sm" onclick={() => store.loadDemo()}>Load demo data</Button>
    </div>
  {:else}
    <div class="card box">
      <Label>% Goal achieved · per session</Label>
      <div class="bars">
        {#each [0, 0.5, 1] as p}<div class="grid" style:bottom="{14 + p * 86}px"></div>{/each}
        {#each last12 as s, i (i)}
          <div class="bar-col">
            <div title="{s.date}: {Math.round(s.pct * 100)}%" style:height="{s.pct * 86}px"
              style:background={s.pct >= 0.85 ? 'var(--text)' : s.pct >= 0.6 ? 'var(--mid)' : 'var(--dim)'}></div>
          </div>
        {/each}
      </div>
    </div>

    <div class="card box">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><Icon name="trophy" size={14} /><Label>Personal records</Label></div>
      <div class="prs">
        {#each prs as [exId, w] (exId)}
          <div><span>{store.exercise(exId)?.name || '—'}</span><div><BigNum size={20}>{toUnit(w)}</BigNum><Label size={9} color="var(--text-low)"> {unit()}</Label></div></div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .page { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .box { padding: 14px; }
  .empty { padding: 18px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty p { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); }
  .bars { margin-top: 14px; height: 100px; display: flex; align-items: flex-end; gap: 4px; padding-bottom: 14px; border-bottom: 1px solid var(--border); position: relative; }
  .grid { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--border); }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .bar-col div { width: 100%; max-width: 18px; border-radius: 2px; position: relative; }
  .prs { display: flex; flex-direction: column; gap: 1px; background: var(--border); border-radius: 8px; overflow: hidden; }
  .prs > div { background: var(--surface); padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; }
  .prs span { font-family: var(--f-sans); font-size: 13px; color: var(--text); }
</style>
