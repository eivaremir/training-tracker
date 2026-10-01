<script lang="ts">
  // Daily log — everything trained on a date: routine executions as whole workouts, extra
  // exercises logged outside a plan, body weight, notes and AI feedback.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import BigNum from '$lib/components/BigNum.svelte';
  import Button from '$lib/components/Button.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ExerciseThumb from '$lib/components/ExerciseThumb.svelte';
  import ExercisePicker from '$lib/components/ExercisePicker.svelte';
  import ExtraSetSheet from '$lib/components/ExtraSetSheet.svelte';
  import WeightSheet from '$lib/components/WeightSheet.svelte';
  import Markdown from '$lib/components/Markdown.svelte';
  import { store } from '$lib/store.svelte';
  import { addDays, parseYmd, uid, ymd } from '$lib/dates';
  import { aiConfigured, askCoach } from '$lib/ai';
  import type { Exercise, Session, SetLog } from '$lib/types';

  const date = $derived(page.url.searchParams.get('date') || store.todayStr);
  const d = $derived(parseYmd(date));
  const isToday = $derived(date === store.todayStr);
  const title = $derived(isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' }));
  const subtitle = $derived(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase());
  const go = (to: Date | string) => goto(`/log?date=${typeof to === 'string' ? to : ymd(to)}`, { keepFocus: true, noScroll: true });

  const routineSessions = $derived(store.sessions.filter((s) => s.date === date && s.planId && s.logs.length));
  const extra = $derived(store.extraSession(date));
  const weight = $derived(store.weights.find((w) => w.date === date));
  const dayLog = $derived(store.day(date));

  // Extra workout grouped by exercise, in the order they were first logged.
  const extraByEx = $derived.by(() => {
    const m = new Map<string, SetLog[]>();
    (extra?.logs ?? []).forEach((l) => m.set(l.exerciseId, [...(m.get(l.exerciseId) ?? []), l]));
    return [...m.entries()];
  });

  const volume = (logs: SetLog[]) => Math.round(logs.reduce((n, l) => n + (l.actual ? l.actual.reps * l.actual.weight : 0), 0));
  const totalSets = (s: Session) => (s.routineId ? store.routine(s.routineId)?.exercises.reduce((n, e) => n + e.goals.length, 0) ?? 0 : s.logs.length);
  const perExercise = (s: Session) => {
    const m = new Map<string, SetLog[]>();
    s.logs.forEach((l) => m.set(l.exerciseId, [...(m.get(l.exerciseId) ?? []), l]));
    return [...m.entries()];
  };
  const fmtSets = (logs: SetLog[]) => logs.slice().sort((a, b) => a.setIndex - b.setIndex)
    .map((l) => (l.actual ? `${l.actual.reps}×${l.actual.weight}` : 'skip')).join('  ');

  let expanded = $state<Record<string, boolean>>({});

  // ---- extra workout ----
  let picking = $state(false);
  let logging = $state<Exercise | null>(null);
  let weighing = $state(false);

  function lastSetOf(exId: string) {
    const logs = store.sessions.filter((s) => s.date <= date).flatMap((s) => s.logs)
      .filter((l) => l.exerciseId === exId && l.actual).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    return logs.at(-1)?.actual ?? undefined;
  }

  function addExtraSets(ex: Exercise, sets: { reps: number; weight: number }[]) {
    const now = new Date().toISOString();
    const base: Session = extra ? $state.snapshot(extra) : { id: uid('s'), planId: null, routineId: null, date, startedAt: now, endedAt: null, logs: [], notes: '' };
    let idx = base.logs.filter((l) => l.exerciseId === ex.id).reduce((m, l) => Math.max(m, l.setIndex + 1), 0);
    const logs = sets.map((a) => ({ sessionId: base.id, exerciseId: ex.id, setIndex: idx++, goalSnapshot: null, actual: a, hitGoal: true, loggedAt: now }));
    store.saveSession({ ...base, logs: [...base.logs, ...logs] });
    logging = null;
  }

  function removeExtraSet(l: SetLog) {
    if (!extra) return;
    const logs = $state.snapshot(extra.logs).filter((x) => !(x.exerciseId === l.exerciseId && x.setIndex === l.setIndex));
    if (logs.length || extra.notes) store.saveSession({ ...$state.snapshot(extra), logs });
    else store.deleteSession(extra.id);
  }

  function saveSessionNotes(s: Session, notes: string) {
    if ((s.notes ?? '') === notes) return;
    store.saveSession({ ...$state.snapshot(s), notes });
  }
  function saveDayNotes(notes: string) {
    if ((dayLog?.notes ?? '') === notes) return;
    store.saveDay({ id: date, date, notes, reviews: dayLog ? $state.snapshot(dayLog.reviews) : [] });
  }

  // ---- AI coach ----
  let question = $state('How did I do? What should I change next time?');
  let asking = $state(false);
  let aiError = $state<string | null>(null);
  async function ask() {
    asking = true; aiError = null;
    try { await askCoach(date, question); }
    catch (e) { aiError = (e as Error).message; }
    finally { asking = false; }
  }
  const hasTraining = $derived(routineSessions.length > 0 || !!extra?.logs.length);
</script>

<TopBar {title} {subtitle}>
  {#snippet right()}
    <IconButton icon="settings" size={19} label="Settings" onclick={() => goto('/settings')} />
    <IconButton icon="plus" label="Log an extra exercise" onclick={() => (picking = true)} />
  {/snippet}
</TopBar>

<div class="datebar">
  <button onclick={() => go(addDays(d, -1))} aria-label="Previous day"><Icon name="chev-l" size={16} /></button>
  <input type="date" value={date} max={store.todayStr} onchange={(e) => e.currentTarget.value && go(e.currentTarget.value)} aria-label="Pick a date" />
  {#if !isToday}<button class="today" onclick={() => go(store.todayStr)}>Today</button>{/if}
  <button onclick={() => go(addDays(d, 1))} disabled={isToday} aria-label="Next day"><Icon name="chev-r" size={16} /></button>
</div>

<div class="page">
  <button class="weight card" onclick={() => (weighing = true)}>
    <Icon name="chart" size={14} />
    <Label>Body weight</Label>
    <span style="flex:1"></span>
    {#if weight}<BigNum size={20}>{weight.kg}</BigNum><Label size={9} color="var(--text-low)">kg</Label>
    {:else}<Label size={9} color="var(--text-low)">Tap to log</Label>{/if}
    <Icon name="edit" size={12} />
  </button>

  <!-- Routine executions: one card per workout -->
  {#each routineSessions as s (s.id)}
    {@const r = s.routineId ? store.routine(s.routineId) : undefined}
    {@const p = store.plans.find((x) => x.id === s.planId)}
    {@const total = totalSets(s)}
    {@const hit = s.logs.filter((l) => l.hitGoal).length}
    <section class="card workout">
      <div class="w-head">
        <div style="flex:1;min-width:0">
          <Label size={9} color="var(--text-low)">{p?.name ?? 'Plan'}{s.endedAt ? ' · finished' : ''}</Label>
          <div class="w-name">{r?.name ?? 'Routine'}</div>
        </div>
        {#if isToday && !s.endedAt}<a class="mini-btn" href="/today?plan={s.planId}">Continue</a>{/if}
      </div>
      <div class="kpis">
        <div><Label size={8} color="var(--text-low)">Sets</Label><div><BigNum size={22}>{s.logs.length}</BigNum><span class="of">/{total}</span></div></div>
        <div><Label size={8} color="var(--text-low)">Goal hit</Label><div><BigNum size={22}>{s.logs.length ? Math.round((hit / s.logs.length) * 100) : 0}</BigNum><span class="of">%</span></div></div>
        <div><Label size={8} color="var(--text-low)">Volume</Label><div><BigNum size={22}>{volume(s.logs).toLocaleString()}</BigNum><span class="of">kg</span></div></div>
      </div>
      <div class="track"><div style:width="{total ? Math.min(100, (s.logs.length / total) * 100) : 0}%"></div></div>
      <button class="expand" onclick={() => (expanded[s.id] = !expanded[s.id])} aria-expanded={!!expanded[s.id]}>
        <Label size={9}>{expanded[s.id] ? 'Hide' : 'Show'} sets</Label><Icon name="chev-d" size={12} />
      </button>
      {#if expanded[s.id]}
        <div class="sets">
          {#each perExercise(s) as [exId, logs] (exId)}
            <div class="set-row"><span class="ex">{store.exercise(exId)?.name ?? exId}</span><span class="mono">{fmtSets(logs)}</span></div>
          {/each}
        </div>
      {/if}
      <textarea placeholder="Notes on this workout…" rows="2" value={s.notes ?? ''} onblur={(e) => saveSessionNotes(s, e.currentTarget.value)}></textarea>
    </section>
  {/each}

  <!-- Extra workout outside plans -->
  <section class="card workout">
    <div class="w-head">
      <div style="flex:1">
        <Label size={9} color="var(--text-low)">Outside your plans</Label>
        <div class="w-name">Extra workout</div>
      </div>
      <button class="add" onclick={() => (picking = true)} aria-label="Add an exercise"><Icon name="plus" size={16} /></button>
    </div>
    {#if extraByEx.length}
      {#each extraByEx as [exId, logs] (exId)}
        {@const ex = store.exercise(exId)}
        <div class="extra-ex">
          <ExerciseThumb name={ex?.name} muscles={ex?.muscles} size={40} />
          <div style="flex:1;min-width:0">
            <div class="cond" style="font-size:15px">{ex?.name ?? 'Deleted exercise'}</div>
            <div class="chips">
              {#each logs as l (l.setIndex)}
                <button class="set-chip" onclick={() => removeExtraSet(l)} title="Remove this set">{l.actual?.reps}×{l.actual?.weight}<Icon name="x" size={10} /></button>
              {/each}
            </div>
          </div>
          {#if ex}<button class="mini-btn" onclick={() => (logging = ex)} aria-label="More sets of {ex.name}"><Icon name="plus" size={12} /></button>{/if}
        </div>
      {/each}
      <Label size={9} color="var(--text-low)">{extra?.logs.length} sets · {volume(extra?.logs ?? []).toLocaleString()} kg volume</Label>
      <textarea placeholder="Notes on this workout…" rows="2" value={extra?.notes ?? ''} onblur={(e) => extra && saveSessionNotes(extra, e.currentTarget.value)}></textarea>
    {:else}
      <p class="muted">Did something extra? Tap <strong>+</strong> to log it from your library or the public catalog.</p>
    {/if}
  </section>

  <!-- Day notes -->
  <section class="card workout">
    <Label>Day notes</Label>
    <textarea placeholder="Sleep, energy, soreness, anything worth remembering…" rows="3" value={dayLog?.notes ?? ''} onblur={(e) => saveDayNotes(e.currentTarget.value)}></textarea>
  </section>

  <!-- AI coach -->
  <section class="card workout">
    <div class="w-head"><Icon name="flame" size={14} /><Label>AI coach</Label></div>
    {#each dayLog?.reviews ?? [] as rv (rv.id)}
      <div class="review">
        <Label size={9} color="var(--text-low)">{rv.provider === 'anthropic' ? 'Claude' : 'Bedrock'} · {rv.model} · {new Date(rv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Label>
        <p class="q">{rv.question}</p>
        <div class="answer"><Markdown source={rv.answer} /></div>
      </div>
    {/each}
    {#if !aiConfigured()}
      <p class="muted">Pick Amazon Bedrock or Claude in <a href="/settings#ai">Settings → AI coach</a> to get feedback on your training.</p>
    {:else if !hasTraining}
      <p class="muted">Log some sets for this day to ask for feedback.</p>
    {:else}
      <textarea bind:value={question} rows="2" aria-label="Question for the AI coach"></textarea>
      {#if aiError}<p class="err">{aiError}</p>{/if}
      <Button full icon="flame" disabled={asking || !question.trim()} onclick={ask}>{asking ? 'Thinking…' : 'Ask about this day'}</Button>
      <p class="fine">Sends this day's log and recent history of the same exercises to {store.settings.aiProvider === 'anthropic' ? 'Anthropic' : 'Amazon Bedrock'}.</p>
    {/if}
  </section>
</div>

<Sheet open={picking} onclose={() => (picking = false)} title="Log an exercise" height="92vh">
  {#if picking}<ExercisePicker onpick={(ex) => { picking = false; logging = ex; }} />{/if}
</Sheet>
<Sheet open={!!logging} onclose={() => (logging = null)} title="Log sets">
  {#if logging}
    {#key logging.id}<ExtraSetSheet exercise={logging} previous={lastSetOf(logging.id)} onadd={(sets) => addExtraSets(logging!, sets)} />{/key}
  {/if}
</Sheet>
<Sheet open={weighing} onclose={() => (weighing = false)} title="Body weight">
  {#if weighing}<WeightSheet {date} onclose={() => (weighing = false)} />{/if}
</Sheet>

<style>
  .datebar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .datebar button { background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 7px 9px; cursor: pointer; display: flex; }
  .datebar button:disabled { opacity: 0.3; cursor: default; }
  .datebar input { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--text);
    font-family: var(--f-mono); font-size: 12px; color-scheme: inherit; }
  .datebar .today { font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
  .weight { display: flex; align-items: center; gap: 8px; padding: 12px 14px; cursor: pointer; color: var(--text); text-align: left; }
  .workout { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .w-head { display: flex; align-items: center; gap: 10px; }
  .w-name { font-family: var(--f-cond); font-weight: 600; font-size: 20px; letter-spacing: 0.3px; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .of { color: var(--text-mid); font-family: var(--f-cond); font-size: 13px; margin-left: 2px; }
  .track { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .track div { height: 100%; background: var(--text); }
  .expand { align-self: flex-start; background: none; border: none; padding: 0; display: flex; align-items: center; gap: 4px; color: var(--text-mid); cursor: pointer; }
  .sets { display: flex; flex-direction: column; gap: 6px; }
  .set-row { display: flex; justify-content: space-between; gap: 10px; font-family: var(--f-sans); font-size: 13px; }
  .set-row .ex { color: var(--text); }
  .mono { font-family: var(--f-mono); font-size: 11px; color: var(--text-mid); text-align: right; }
  textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text);
    outline: none; font-family: var(--f-sans); font-size: 13px; resize: vertical; }
  .add { width: 36px; height: 36px; border-radius: 18px; border: none; background: var(--text); color: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .extra-ex { display: flex; align-items: center; gap: 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .set-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg);
    color: var(--text); font-family: var(--f-mono); font-size: 11px; cursor: pointer; }
  .muted { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
  .muted a { color: var(--text); }
  .review { border-top: 1px dashed var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .q { margin: 0; font-family: var(--f-sans); font-size: 12px; color: var(--text-mid); font-style: italic; }
  .answer { padding: 12px 14px; border-radius: 12px; background: var(--bg); border: 1px solid var(--border); }
  .err { margin: 0; color: var(--danger); font-family: var(--f-sans); font-size: 12px; }
  .fine { margin: 0; font-family: var(--f-mono); font-size: 9px; letter-spacing: 0.5px; color: var(--text-low); text-align: center; }
</style>
