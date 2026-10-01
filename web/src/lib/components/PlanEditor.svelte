<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import TextField from './TextField.svelte';
  import RoutineEditor from './RoutineEditor.svelte';
  import { store } from '../store.svelte';
  import { uid } from '../dates';
  import type { Plan, PlanKind } from '../types';

  let { plan, onsave, oncancel }: { plan?: Plan; onsave: (p: Plan) => void; oncancel: () => void } = $props();

  const emptyDays = (k: PlanKind): Record<string, string | null> =>
    k === 'weekly'
      ? { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }
      : Object.fromEntries(Array.from({ length: 31 }, (_, i) => [String(i + 1), null]));

  // svelte-ignore state_referenced_locally
  let name = $state(plan?.name || '');
  // svelte-ignore state_referenced_locally
  let kind = $state<PlanKind>(plan?.kind || 'weekly');
  // svelte-ignore state_referenced_locally
  let days = $state(plan ? { ...plan.days } : emptyDays('weekly'));
  let picking = $state<string | null>(null);
  let creatingRoutine = $state(false);

  const WEEK = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  const switchKind = (k: PlanKind) => { if (k !== kind) { kind = k; days = emptyDays(k); } };
  const choose = (rid: string | null) => { if (picking) days[picking] = rid; picking = null; };
  const save = () => onsave({
    id: plan?.id || uid('pl'), name: name || 'Untitled plan', kind, days: $state.snapshot(days),
    subscribed: plan?.subscribed || false, startedAt: plan?.startedAt || null
  });
</script>

<div class="wrap">
  <TextField label="Name" bind:value={name} placeholder="e.g. Hypertrophy block" />

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
            {@const r = days[k] ? store.routine(days[k]!) : null}
            <button class="list-btn" onclick={() => (picking = k)}>
              <span class="dk">{l.slice(0, 3)}</span>
              <span class="rn" style:color={r ? 'var(--text)' : 'var(--text-low)'}>{r ? r.name : 'Rest day'}</span>
              <Icon name="chev-r" size={14} />
            </button>
          {/each}
        </div>
      {:else}
        <div class="month">
          {#each Array.from({ length: 31 }, (_, i) => String(i + 1)) as d (d)}
            <button class:filled={!!days[d]} onclick={() => (picking = d)}>{d}</button>
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

<Sheet open={picking !== null} onclose={() => (picking = null)} title={kind === 'weekly' ? `Routine for ${picking}` : `Routine for day ${picking}`}>
  <div class="pick">
    <button class="list-btn rest" onclick={() => choose(null)}>Rest day (none)</button>
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
      {@const sel = picking !== null && days[picking] === r.id}
      <button class="list-btn" style:border-color={sel ? 'var(--border-hi)' : 'var(--border)'} style="gap:10px" onclick={() => choose(r.id)}>
        <div style="flex:1">
          <div class="cond" style="font-size:15px">{r.name}</div>
          <Label size={9} color="var(--text-low)">{r.exercises.length} ex · {r.exercises.reduce((s, e) => s + e.goals.length, 0)} sets</Label>
        </div>
        {#if sel}<Icon name="check" size={14} />{/if}
      </button>
    {/each}
  </div>
</Sheet>

<Sheet open={creatingRoutine} onclose={() => (creatingRoutine = false)} title="New routine" height="94vh">
  {#if creatingRoutine}
    <RoutineEditor oncancel={() => (creatingRoutine = false)}
      onsave={(r) => { store.saveRoutine(r); creatingRoutine = false; choose(r.id); }} />
  {/if}
</Sheet>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .kinds { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kinds button { padding: 12px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 10px;
    cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 2px; }
  .kinds button.on { background: var(--surface-hi); border-color: var(--border-hi); }
  .sub { font-family: var(--f-sans); font-size: 11px; color: var(--text-mid); }
  .week { display: flex; flex-direction: column; gap: 6px; }
  .dk { width: 36px; font-family: var(--f-cond); font-weight: 600; font-size: 14px; color: var(--text-mid); letter-spacing: 1px; text-transform: uppercase; }
  .rn { flex: 1; font-family: var(--f-sans); font-size: 13px; }
  .month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .month button { aspect-ratio: 1; background: var(--bg); color: var(--text-mid); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; display: flex; align-items: center; justify-content: center; }
  .month button.filled { background: var(--text); color: var(--bg); border-color: var(--text); }
  .pick { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
  .none { padding: 12px 14px; border: 1px dashed var(--border-hi); border-radius: 10px; font-family: var(--f-sans); font-size: 13px;
    line-height: 1.5; color: var(--text-mid); }
  .create { border-style: dashed; border-color: var(--border-hi); }
  .rest { color: var(--text-mid); font-family: var(--f-sans); font-size: 13px; font-style: italic; }
</style>
