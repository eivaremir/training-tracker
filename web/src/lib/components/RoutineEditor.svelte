<script lang="ts">
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import TextField from './TextField.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import GoalEditor from './GoalEditor.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import { store } from '../store.svelte';
  import { uid } from '../dates';
  import type { Routine, RoutineExercise } from '../types';

  let { routine, onsave, oncancel, ondelete }: {
    routine?: Routine; onsave: (r: Routine) => void; oncancel: () => void; ondelete?: (id: string) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(routine?.name || '');
  // svelte-ignore state_referenced_locally
  let exs = $state<RoutineExercise[]>(routine ? structuredClone($state.snapshot(routine.exercises)) : []);
  let picking = $state(false);
  let editingGoal = $state<number | null>(null);
  let confirmDel = $state(false);

  function addEx(exerciseId: string) {
    const g = { reps: 8, weight: 20, restSeconds: 90 };
    exs.push({ exerciseId, order: exs.length, goals: [{ ...g }, { ...g }, { ...g }], goalUpdatedAt: new Date().toISOString() });
    picking = false;
  }
  function moveEx(i: number, dir: number) {
    const j = i + dir;
    if (j < 0 || j >= exs.length) return;
    [exs[i], exs[j]] = [exs[j], exs[i]];
    exs.forEach((e, k) => (e.order = k));
  }
  const save = () => onsave({ id: routine?.id || uid('rt'), name: name || 'Untitled routine', exercises: $state.snapshot(exs) });
</script>

<div class="wrap">
  <TextField label="Name" bind:value={name} placeholder="e.g. Push B" />

  <div>
    <div class="head">
      <Label>Exercises ({exs.length})</Label>
      <Label color="var(--text-low)">{exs.reduce((s, e) => s + e.goals.length, 0)} sets total</Label>
    </div>
    <div class="list">
      {#each exs as re, idx (re.exerciseId + idx)}
        {@const ex = store.exercise(re.exerciseId)}
        <div class="item">
          <div class="item-head">
            <div class="arrows">
              <button onclick={() => moveEx(idx, -1)} disabled={idx === 0} aria-label="Move up">▲</button>
              <button onclick={() => moveEx(idx, 1)} disabled={idx === exs.length - 1} aria-label="Move down">▼</button>
            </div>
            <ExerciseThumb name={ex?.name} muscles={ex?.muscles} size={36} />
            <div class="name-col">
              <div class="name">{ex?.name ?? 'Deleted exercise'}</div>
              <Label size={9} color="var(--text-low)">{re.goals.length} sets</Label>
            </div>
            <button class="mini-btn" onclick={() => (editingGoal = idx)}>Goals</button>
            <button class="del" onclick={() => exs.splice(idx, 1)} aria-label="Remove exercise"><Icon name="trash" size={14} /></button>
          </div>
          <div class="goals" style:grid-template-columns="repeat({re.goals.length}, 1fr)">
            {#each re.goals as g, i}
              <div class="g">
                <Label size={8} color="var(--text-low)">S{i + 1}</Label>
                <div style="margin-top:1px"><BigNum size={14}>{g.reps}</BigNum><span class="x">×</span><BigNum size={14}>{g.weight}</BigNum></div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <button class="dashed-btn add" onclick={() => (picking = true)}><Icon name="plus" size={14} /> Add exercise</button>
  </div>

  <div class="row" style="margin-top:6px">
    {#if routine && ondelete}<Button variant="danger" icon="trash" onclick={() => (confirmDel = true)}>Delete</Button>{/if}
    <div style="flex:1"></div>
    <Button variant="secondary" onclick={oncancel}>Cancel</Button>
    <Button onclick={save} disabled={!name || !exs.length}>Save</Button>
  </div>
</div>

<Sheet open={picking} onclose={() => (picking = false)} title="Add exercise" height="92vh">
  {#if picking}<ExercisePicker onpick={(ex) => addEx(ex.id)} />{/if}
</Sheet>

<Sheet open={editingGoal !== null} onclose={() => (editingGoal = null)} title="Edit goals" height="92vh">
  {#if editingGoal !== null}
    {@const i = editingGoal}
    <GoalEditor goals={exs[i].goals}
      onsave={(g) => { exs[i].goals = g; exs[i].goalUpdatedAt = new Date().toISOString(); editingGoal = null; }}
      oncancel={() => (editingGoal = null)} />
  {/if}
</Sheet>

<Sheet open={confirmDel} onclose={() => (confirmDel = false)} title="Delete routine?">
  <div class="confirm">
    <div class="body-copy"><strong>{routine?.name}</strong> will be removed. Plans referencing it become rest days.
      Logged sessions stay in history with their goal snapshots.</div>
    <div class="row">
      <Button variant="secondary" full onclick={() => (confirmDel = false)}>Cancel</Button>
      <Button variant="danger" full icon="trash" onclick={() => { confirmDel = false; ondelete?.(routine!.id); }}>Delete</Button>
    </div>
  </div>
</Sheet>

<style>
  .wrap { padding: 18px; display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .item { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .item-head { display: flex; align-items: center; gap: 10px; }
  .arrows { display: flex; flex-direction: column; gap: 2px; }
  .arrows button { background: transparent; border: none; color: var(--text-mid); cursor: pointer; padding: 0; line-height: 0.6; font-size: 14px; }
  .arrows button:disabled { color: var(--text-low); cursor: default; }
  .name-col { flex: 1; min-width: 0; }
  .name { font-family: var(--f-cond); font-weight: 600; font-size: 15px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .del { background: transparent; border: none; color: var(--danger); cursor: pointer; padding: 6px; }
  .goals { display: grid; gap: 4px; }
  .g { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 6px 4px; text-align: center; }
  .x { color: var(--text-low); padding: 0 2px; font-size: 9px; }
  .add { margin-top: 8px; padding: 12px; border-radius: 10px; font-size: 12px; }
  .confirm { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
</style>
