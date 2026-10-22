<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import TextField from './TextField.svelte';
  import MuscleLoadMap from './MuscleLoadMap.svelte';
  import RoutineEditor from './RoutineEditor.svelte';
  import { store } from '../store.svelte';
  import { toUnit, unit } from '../units';
  import { fmtVol } from '../volume';
  import { loggedLoad, totalVolumeKg } from '../muscleLoad';
  import { uid } from '../dates';
  import { routinesOn } from '../plans';
  import type { Plan, PlanKind } from '../types';

  let { plan, onsave, oncancel }: { plan?: Plan; onsave: (p: Plan) => void; oncancel: () => void } = $props();

  const keysOf = (k: PlanKind) => (k === 'weekly' ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] : Array.from({ length: 31 }, (_, i) => String(i + 1)));
  const emptyDays = (k: PlanKind): Record<string, string[]> => Object.fromEntries(keysOf(k).map((d) => [d, []]));

  // svelte-ignore state_referenced_locally
  let name = $state(plan?.name || '');
  // svelte-ignore state_referenced_locally
  let kind = $state<PlanKind>(plan?.kind || 'weekly');
  // svelte-ignore state_referenced_locally
  let days = $state<Record<string, string[]>>(plan ? Object.fromEntries(keysOf(plan.kind).map((d) => [d, routinesOn(plan, d)])) : emptyDays('weekly'));
  let picking = $state<string | null>(null);
  let creatingRoutine = $state(false);

  const WEEK = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  const switchKind = (k: PlanKind) => { if (k !== kind) { kind = k; days = emptyDays(k); } };
  // A day can hold several routines, done in the order they were added.
  const toggle = (rid: string) => {
    if (!picking) return;
    const cur = days[picking];
    days[picking] = cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid];
  };
  const add = (rid: string) => { if (picking && !days[picking].includes(rid)) days[picking] = [...days[picking], rid]; };
  const names = (k: string) => days[k].map((id) => store.routine(id)?.name).filter(Boolean).join(' + ');
  const save = () => onsave({
    id: plan?.id || uid('pl'), name: name || 'Untitled plan', kind, days: $state.snapshot(days),
    subscribed: plan?.subscribed || false, startedAt: plan?.startedAt || null
  });
</script>

<div class="wrap">
  <TextField label="Name" bind:value={name} placeholder="e.g. Hypertrophy block" />

  {#if plan}
    {@const planLogs = store.sessions.filter((x) => x.planId === plan.id).flatMap((x) => x.logs)}
    <MuscleLoadMap score={loggedLoad(planLogs)} title="Plan progress · all logged"
      caption={planLogs.length ? `${fmtVol(toUnit(totalVolumeKg(planLogs), 0))} ${unit()} total` : undefined}
      empty="No sessions logged for this plan yet" />
  {/if}

  <div>
    <Label>Type</Label>
    <div class="kinds">
      {#each [{ id: 'weekly', label: 'Weekly', sub: 'Mon → Sun cycle' }, { id: 'monthly', label: 'Monthly', sub: 'Date-based, 1 → 31' }] as const as o}
        <button class:on={kind === o.id} onclick={() => switchKind(o.id)}>
          <span class="cond" style="font-size:15px">{o.label}</span>
          <span class="sub">{o.sub}</span>
        </button>
      {/each}
    </div>
  </div>

  <div>
    <Label>{kind === 'weekly' ? 'Weekly schedule' : 'Monthly schedule'}</Label>
    <div style="margin-top:8px">
      {#if kind === 'weekly'}
        <div class="week">
          {#each WEEK as [k, l] (k)}
            {@const n = names(k)}
            <button class="list-btn" onclick={() => (picking = k)}>
              <span class="dk">{l.slice(0, 3)}</span>
              <span class="rn" style:color={n ? 'var(--text)' : 'var(--text-low)'}>{n || 'Rest day'}</span>
              <Icon name="chev-r" size={14} />
            </button>
          {/each}
        </div>
      {:else}
        <div class="month">
          {#each Array.from({ length: 31 }, (_, i) => String(i + 1)) as d (d)}
            <button class:filled={days[d].length > 0} onclick={() => (picking = d)} title={names(d) || 'Rest day'}>{d}{#if days[d].length > 1}<sup>{days[d].length}</sup>{/if}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="row" style="margin-top:6px">
    <Button variant="secondary" full onclick={oncancel}>Cancel</Button>
    <Button full onclick={save} disabled={!name}>Save plan</Button>
  </div>
</div>

<Sheet open={picking !== null} onclose={() => (picking = null)} height="88vh" title={kind === 'weekly' ? `Routines for ${picking}` : `Routines for day ${picking}`}>
  <div class="pick">
    <Label size={9} color="var(--text-low)">Pick one or more. They're done in the order you pick them.</Label>
    <button class="list-btn rest" onclick={() => { if (picking) days[picking] = []; }}>Rest day (clear all)</button>
    <button class="list-btn create" onclick={() => (creatingRoutine = true)}>
      <Icon name="plus" size={14} />
      <div style="flex:1">
        <div class="cond" style="font-size:15px">New routine</div>
        <Label size={9} color="var(--text-low)">Pick exercises and set goals, then it's assigned to this day</Label>
      </div>
    </button>
    {#if !store.routines.length}
      <div class="none">Days are filled with <strong>routines</strong>: a set of exercises with per-set goals. Create your first one above.</div>
    {/if}
    {#each store.routines as r (r.id)}
      {@const pos = picking !== null ? days[picking].indexOf(r.id) : -1}
      {@const sel = pos >= 0}
      <button class="list-btn" style:border-color={sel ? 'var(--border-hi)' : 'var(--border)'} style="gap:10px" onclick={() => toggle(r.id)} aria-pressed={sel}>
        <div style="flex:1">
          <div class="cond" style="font-size:15px">{r.name}</div>
          <Label size={9} color="var(--text-low)">{r.exercises.length} ex · {r.exercises.reduce((s, e) => s + e.goals.length, 0)} sets</Label>
        </div>
        {#if sel}<span class="order">{pos + 1}</span>{/if}
      </button>
    {/each}
    <div style="margin-top:8px"><Button full onclick={() => (picking = null)}>Done</Button></div>
  </div>
</Sheet>

<Sheet open={creatingRoutine} onclose={() => (creatingRoutine = false)} title="New routine" height="94vh">
  {#if creatingRoutine}
    <RoutineEditor oncancel={() => (creatingRoutine = false)}
      onsave={(r) => { store.saveRoutine(r); creatingRoutine = false; add(r.id); }} />
  {/if}
</Sheet>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .kinds { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kinds button { padding: 12px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 10px;
    cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px; }
  .kinds button.on { background: var(--surface-hi); border-color: var(--border-hi); }
  .sub { font-family: var(--f-sans); font-size: 12px; color: var(--text-mid); }
  .week { display: flex; flex-direction: column; gap: 6px; }
  .dk { width: 36px; font-family: var(--f-cond); font-weight: 600; font-size: 14px; color: var(--text-mid); letter-spacing: 1px; text-transform: uppercase; }
  .rn { flex: 1; font-family: var(--f-sans); font-size: 13px; }
  .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .month button { aspect-ratio: 1; background: var(--bg); color: var(--text-mid); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .month button.filled { background: var(--text); color: var(--bg); border-color: var(--text); }
  .pick { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
  .none { padding: 12px 14px; border: 1px dashed var(--border-hi); border-radius: 10px; font-family: var(--f-sans); font-size: 13px;
    line-height: 1.5; color: var(--text-mid); }
  .order { width: 22px; height: 22px; border-radius: 11px; background: var(--text); color: var(--bg); display: flex; align-items: center;
    justify-content: center; font-family: var(--f-cond); font-weight: 700; font-size: 13px; flex-shrink: 0; }
  .month sup { font-size: 9px; margin-left: 1px; }
  .create { border-style: dashed; border-color: var(--border-hi); }
  .rest { color: var(--text-mid); font-family: var(--f-sans); font-size: 13px; font-style: italic; }
</style>
