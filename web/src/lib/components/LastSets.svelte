<script lang="ts">
  // The most recent previous day an exercise was done: each set as reps × weight, hit or missed.
  // `compact` is a one-line strip for the Today cards (renders nothing without history); otherwise a small table.
  import Label from './Label.svelte';
  import BigNum from './BigNum.svelte';
  import Icon from './Icon.svelte';
  import { store } from '../store.svelte';
  import { unit, toUnit } from '../units';
  import { parseYmd } from '../dates';
  import { exercisePR } from '../pr';
  import type { SetLog } from '../types';

  let { exerciseId, excludeSessionId, compact = false }: { exerciseId: string; excludeSessionId?: string; compact?: boolean } = $props();

  // All-time PR standing, so a past set shows a medal when it still ranks in the exercise's top 3.
  const pr = $derived(exercisePR(exerciseId));
  const medalLabel = (r: 1 | 2 | 3) => (r === 1 ? 'all-time best' : r === 2 ? '2nd best ever' : '3rd best ever');

  // All of that day's sets (a plan session and an extra workout on the same day merge), in the order they were logged.
  const last = $derived.by(() => {
    let date = '';
    let sets: SetLog[] = [];
    for (const s of store.sessions) {
      if (s.id === excludeSessionId || s.date < date) continue;
      const logs = s.logs.filter((l) => l.exerciseId === exerciseId);
      if (!logs.some((l) => l.actual)) continue;
      if (s.date > date) { date = s.date; sets = []; }
      sets.push(...logs);
    }
    return date ? { date, sets: sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)) } : null;
  });

  const when = $derived.by(() => {
    if (!last) return '';
    const d = parseYmd(last.date);
    const days = Math.round((parseYmd(store.todayStr).getTime() - d.getTime()) / 86_400_000);
    const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${ago}`;
  });
  // Hit/miss only means something for sets that had a goal (extra sets don't).
  const goalSets = $derived(last?.sets.filter((l) => l.goalSnapshot) ?? []);
  const hits = $derived(goalSets.filter((l) => l.hitGoal).length);
  const loaded = $derived(!!last?.sets.some((l) => l.actual?.weight));
  // Unloaded (bodyweight) sets show reps only.
  const fmt = (s: { reps: number; weight: number }, repsSuffix = '') => (s.weight ? `${s.reps}×${toUnit(s.weight)}` : `${s.reps}${repsSuffix}`);
  const setText = (l: SetLog) => (l.actual ? fmt(l.actual) : 'skip');
  const missed = (l: SetLog) => !!l.goalSnapshot && !l.hitGoal;
</script>

{#if compact}
  {#if last}
    <div class="strip">
      <div class="meta">
        <Label size={8} color="var(--text-low)">Last · {when}</Label>
        {#if goalSets.length}<Label size={8} color="var(--text-low)">{hits}/{goalSets.length} hit</Label>{/if}
      </div>
      <div class="chips">
        {#each last.sets as l, i (i)}
          {@const r = pr.rank(l)}
          <span class="chip" class:miss={missed(l)} class:skip={!l.actual} class:medal={!!r}
            style:--medal={r ? `var(--pr-${r})` : undefined}
            title={r ? `Set PR · ${medalLabel(r)}` : l.goalSnapshot ? (l.hitGoal ? 'Hit goal' : `Missed · goal ${fmt(l.goalSnapshot, ' reps')}`) : undefined}>
            {#if r}<span class="dot"></span>{/if}{setText(l)}
          </span>
        {/each}
        <Label size={8} color="var(--text-low)">{loaded ? unit() : 'reps'}</Label>
      </div>
    </div>
  {/if}
{:else}
  <div class="card">
    <div class="head">
      <Label>Last session</Label>
      {#if last}<Label size={9} color="var(--text-low)">{when}</Label>{/if}
    </div>
    {#if last}
      <div class="rows">
        {#each last.sets as l, i (i)}
          <div class="row" class:miss={missed(l)}>
            <span class="n">{i + 1}</span>
            {#if l.actual}
              {@const c = missed(l) ? 'var(--text-mid)' : 'var(--text)'}
              <BigNum size={18} color={c}>{l.actual.reps}</BigNum>
              {#if l.actual.weight}
                <span class="x">×</span><BigNum size={18} color={c}>{toUnit(l.actual.weight)}</BigNum><Label size={9} color="var(--text-low)">{unit()}</Label>
              {:else}
                <Label size={9} color="var(--text-low)">reps</Label>
              {/if}
            {:else}
              <Label size={9} color="var(--text-low)">Skipped</Label>
            {/if}
            <span style="flex:1"></span>
            {#if l.goalSnapshot && l.actual}
              {#if l.hitGoal}
                <span class="tag hit"><Icon name="check" size={12} />Hit</span>
              {:else}
                <span class="tag">Goal {fmt(l.goalSnapshot, ' reps')}</span>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="none">No sets logged yet.</div>
    {/if}
  </div>
{/if}

<style>
  .strip { margin-bottom: 8px; padding: 8px 12px; border: 1px dashed var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 6px; }
  .meta { display: flex; justify-content: space-between; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--border-hi); border-radius: 6px; color: var(--text);
    font-family: var(--f-cond); font-weight: 600; font-size: 14px; letter-spacing: 0.3px; font-variant-numeric: tabular-nums; }
  .chip.miss { border-style: dashed; color: var(--text-mid); }
  .chip.skip { border-color: var(--border); color: var(--text-low); }
  /* A top-3 all-time set: medal-tinted border + a filled dot (gold/silver/bronze via --medal). */
  .chip.medal { border-color: var(--medal); border-style: solid;
    background: color-mix(in srgb, var(--medal) 12%, transparent); color: var(--text); }
  .chip .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--medal); flex-shrink: 0; }

  .card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .rows { margin-top: 8px; display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden; }
  .row { background: var(--surface); padding: 8px 12px; display: flex; align-items: baseline; gap: 4px; }
  .n { width: 22px; flex-shrink: 0; font-family: var(--f-cond); font-weight: 700; font-size: 15px; color: var(--text-low); }
  .x { color: var(--text-low); padding: 0 2px; }
  .tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; border: 1px dashed var(--border-hi);
    color: var(--text-mid); font-family: var(--f-mono); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; align-self: center; }
  .tag.hit { border: none; background: var(--text); color: var(--bg); }
  .none { margin-top: 6px; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); }
</style>
