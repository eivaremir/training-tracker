<script lang="ts">
  // Active session — pick which subscribed plan's routine to log, swipe sets to log them.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import TopBar from '$lib/components/TopBar.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import BigNum from '$lib/components/BigNum.svelte';
  import Button from '$lib/components/Button.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import ExerciseThumb from '$lib/components/ExerciseThumb.svelte';
  import ExerciseDetails from '$lib/components/ExerciseDetails.svelte';
  import LastSets from '$lib/components/LastSets.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import SetRow from '$lib/components/SetRow.svelte';
  import EditSetForm from '$lib/components/EditSetForm.svelte';
  import { rest } from '$lib/rest.svelte';
  import { store } from '$lib/store.svelte';
  import { meetsGoal, fmtWeight } from '$lib/units';
  import { uid, weekdayKey, ymd } from '$lib/dates';
  import type { RoutineExercise, SetLog } from '$lib/types';

  const today = store.today;
  const todayStr = ymd(today);
  const dateLabel = `${weekdayKey(today).toUpperCase()} ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`;

  const items = $derived(store.itemsFor(today));
  let selectedKey = $state<string | null>(null);

  // Default: ?plan= from the dashboard, else a plan with an unfinished session today, else the first item.
  const selected = $derived.by(() => {
    // Key is "planId/routineId"; links from older builds pass only ?plan=.
    const q = page.url.searchParams;
    const key = selectedKey ?? (q.get('plan') ? `${q.get('plan')}/${q.get('routine') ?? ''}` : null);
    const [kp, kr] = key?.split('/') ?? [];
    return (
      items.find((it) => it.plan.id === kp && it.routine.id === kr) ??
      items.find((it) => it.plan.id === kp && !kr) ??
      items.find((it) => store.sessions.some((s) => s.planId === it.plan.id && s.routineId === it.routine.id && s.date === todayStr && !s.endedAt)) ??
      items[0]
    );
  });

  const session = $derived(selected ? store.sessionFor(selected.plan.id, selected.routine.id, todayStr) : undefined);
  const logs = $derived(session?.logs ?? []);
  const logAt = (exId: string, i: number) => logs.find((l) => l.exerciseId === exId && l.setIndex === i);
  const totalSets = $derived(selected ? selected.routine.exercises.reduce((s, e) => s + e.goals.length, 0) : 0);
  const hitSets = $derived(logs.filter((l) => l.hitGoal).length);
  const activeKey = $derived.by(() => {
    for (const re of selected?.routine.exercises ?? [])
      for (let i = 0; i < re.goals.length; i++) if (!logAt(re.exerciseId, i)) return `${re.exerciseId}_${i}`;
    return null;
  });
  const sessionDone = $derived(totalSets > 0 && logs.length >= totalSets);

  let editing = $state<{ re: RoutineExercise; idx: number } | null>(null);
  let detailId = $state<string | null>(null);
  let detailTab = $state<'guide' | 'stats'>('guide');
  const detailEx = $derived(detailId ? store.exercise(detailId) : undefined);
  const openDetail = (id: string, tab: 'guide' | 'stats') => { detailTab = tab; detailId = id; };
  // TopBar's height, so the progress block sticks right under it (TopBar grows with the safe-area inset).
  let barH = $state(0);
  let restSheet = $state(false);

  // Sessions are created lazily on the first logged set.
  function writeLogs(next: SetLog[], id = session?.id ?? uid('s')) {
    if (!selected) return;
    const base = session ?? { id, planId: selected.plan.id, routineId: selected.routine.id, date: todayStr, startedAt: new Date().toISOString(), endedAt: null, logs: [] };
    store.saveSession({ ...$state.snapshot(base), logs: next });
  }
  function record(re: RoutineExercise, idx: number, actual: SetLog['actual'], hitGoal: boolean) {
    const goal = re.goals[idx];
    const sessionId = session?.id ?? uid('s');
    const log: SetLog = { sessionId, exerciseId: re.exerciseId, setIndex: idx, goalSnapshot: { ...goal }, actual, hitGoal, loggedAt: new Date().toISOString() };
    writeLogs([...$state.snapshot(logs), log], sessionId);
    // The rest timer itself floats over every page (app layout).
    if (selected && actual && store.restEnabled && goal.restSeconds > 0)
      rest.start(goal.restSeconds, { planId: selected.plan.id, routineId: selected.routine.id, sessionId });
  }
  function saveEdit(actual: { reps: number; weight: number }) {
    if (!editing) return;
    const g = editing.re.goals[editing.idx];
    record(editing.re, editing.idx, actual, actual.reps >= g.reps && meetsGoal(actual.weight, g.weight));
    editing = null;
  }
  function skip() {
    if (!editing) return;
    record(editing.re, editing.idx, null, false);
    editing = null;
  }
  const undo = (re: RoutineExercise, i: number) => writeLogs($state.snapshot(logs).filter((l) => !(l.exerciseId === re.exerciseId && l.setIndex === i)));
  function finish() {
    if (session) store.saveSession({ ...$state.snapshot(session), endedAt: new Date().toISOString() });
    goto('/');
  }
</script>

{#if !selected}
  <TopBar title="Rest Day" subtitle={dateLabel} />
  <div class="empty">
    <Icon name="cal" size={32} />
    <div>No subscribed plan has a routine for today.</div>
    <div style="margin-top:20px"><Button icon="cal" onclick={() => goto('/plans')}>Manage plans</Button></div>
  </div>
{:else}
  {@const { plan, routine } = selected}
  <div class="bar" bind:offsetHeight={barH}>
  <TopBar title={routine.name.toUpperCase()} subtitle="{plan.name} · {dateLabel}">
    {#snippet right()}
      <button class="rest-btn" onclick={() => (restSheet = true)}>
        <Icon name="timer" size={14} /><span>Rest {store.restEnabled ? 'on' : 'off'}</span>
      </button>
    {/snippet}
  </TopBar>
  </div>

  {#if items.length > 1}
    <div class="picker">
      {#each items as it (it.plan.id + it.routine.id)}
        <button class:on={it.plan.id === plan.id && it.routine.id === routine.id} onclick={() => (selectedKey = `${it.plan.id}/${it.routine.id}`)}>
          {it.routine.name} · {it.plan.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="overall" style:top="{barH - 1}px">
    <div class="nums">
      <BigNum size={30}>{logs.length}</BigNum>
      <span class="slash">/</span>
      <BigNum size={22} color="var(--text-mid)">{totalSets}</BigNum>
      <Label>sets</Label>
      <div style="flex:1"></div>
      <BigNum size={22} color="var(--text-mid)">{hitSets}</BigNum>
      <Label>hit</Label>
    </div>
    <div class="track"><div style:width="{totalSets ? (logs.length / totalSets) * 100 : 0}%"></div></div>
  </div>

  <div class="list r-grid">
    {#each routine.exercises as re, exIdx (re.exerciseId + exIdx)}
      {@const ex = store.exercise(re.exerciseId)}
      {@const exDone = re.goals.every((_, i) => logAt(re.exerciseId, i))}
      <div class="ex r-flat" style:margin-top="{exIdx === 0 ? 4 : 18}px">
        <div class="ex-head">
          <ExerciseThumb name={ex?.name} muscles={ex?.muscles} images={ex?.images} instructions={ex?.instructions} size={44} zoom />
          <button class="ex-open" disabled={!ex} onclick={() => ex && openDetail(ex.id, 'guide')} aria-label="{ex?.name ?? 'Exercise'} details">
            <span class="ex-name">{ex?.name ?? 'Deleted exercise'}</span>
            <Label size={9} color="var(--text-low)">{re.goals.length} sets · {re.goals[0]?.reps}×{fmtWeight(re.goals[0]?.weight ?? 0)} · rest {re.goals[0]?.restSeconds}s</Label>
          </button>
          {#if ex}<IconButton icon="chart" size={18} label="{ex.name} stats" onclick={() => openDetail(ex.id, 'stats')} />{/if}
          {#if exDone}<div class="done"><Icon name="check" size={14} /></div>{/if}
        </div>
        <div style="padding:8px">
          <LastSets exerciseId={re.exerciseId} excludeSessionId={session?.id} compact />
          {#each re.goals as g, i (i)}
            <SetRow idx={i} goal={g} log={logAt(re.exerciseId, i)} isActive={activeKey === `${re.exerciseId}_${i}`}
              onhit={() => record(re, i, { reps: g.reps, weight: g.weight }, true)}
              onedit={() => (editing = { re, idx: i })}
              onundo={() => undo(re, i)} />
          {/each}
        </div>
      </div>
    {/each}

    {#if sessionDone}
      <div style="margin-top:18px"><Button full size="lg" icon="check" onclick={finish}>Finish session</Button></div>
    {:else}
      <div class="gestures">
        <Label>Gestures</Label>
        <div>Swipe → on a set to log it as hit. Swipe ← to edit reps/weight.</div>
      </div>
    {/if}
  </div>
{/if}

<Sheet open={!!detailEx} onclose={() => (detailId = null)} title={detailEx?.name} height="92vh">
  {#if detailEx}<ExerciseDetails exercise={detailEx} bind:tab={detailTab} excludeSessionId={session?.id} />{/if}
</Sheet>

<Sheet open={!!editing} onclose={() => (editing = null)} title="Edit set">
  {#if editing}<EditSetForm goal={editing.re.goals[editing.idx]} equipment={store.exercise(editing.re.exerciseId)?.equipment} onsave={saveEdit} onskip={skip} />{/if}
</Sheet>

<Sheet open={restSheet} onclose={() => (restSheet = false)} title="Rest timer">
  <div class="rest-cfg">
    <div>
      <div class="rest-title">Auto-start rest after each set</div>
      <Label color="var(--text-low)">Uses each set's goal rest duration</Label>
    </div>
    <Toggle bind:on={store.restEnabled} />
  </div>
</Sheet>

<style>
  .empty { padding: 32px; text-align: center; color: var(--text-mid); }
  .empty > div:first-of-type { margin-top: 12px; font-family: var(--f-sans); font-size: 14px; }
  .rest-btn { padding: 8px 12px; border-radius: 8px; background: transparent; border: 1px solid var(--border); color: var(--text);
    cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .rest-btn span { font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .picker { padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; gap: 6px; overflow-x: auto; }
  .picker button { padding: 8px 12px; flex-shrink: 0; background: transparent; color: var(--text-mid); border: 1px solid var(--border);
    border-radius: 8px; cursor: pointer; font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px;
    text-transform: uppercase; white-space: nowrap; }
  .picker button.on { background: var(--text); color: var(--bg); border-color: var(--text); }
  .bar { position: sticky; top: 0; z-index: 11; }
  /* Overlaps the bar's bottom border by 1px so no content peeks through a rounding gap. */
  .overall { position: sticky; z-index: 10; background: var(--bg); padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .nums { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
  .slash { color: var(--text-low); font-family: var(--f-cond); font-size: 22px; }
  .track { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; background: var(--text); transition: width 0.3s; }
  .list { padding: 8px 12px 24px; }
  .ex { border-radius: 14px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
  .ex-head { padding: 12px 14px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border); }
  .ex-open { flex: 1; min-width: 0; padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; }
  .ex-open:disabled { cursor: default; }
  .ex-name { display: block; font-family: var(--f-cond); font-weight: 600; font-size: 18px; color: var(--text); letter-spacing: 0.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .done { width: 24px; height: 24px; border-radius: 12px; background: var(--text); color: var(--bg); display: flex; align-items: center; justify-content: center; }
  .gestures { margin-top: 18px; padding: 14px 16px; border: 1px dashed var(--border); border-radius: 12px; color: var(--text-mid); }
  .gestures div { margin-top: 6px; font-family: var(--f-sans); font-size: 13px; line-height: 1.5; }
  .rest-cfg { padding: 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .rest-title { font-family: var(--f-sans); font-size: 14px; color: var(--text); font-weight: 500; }
</style>
