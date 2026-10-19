<script lang="ts">
  // History — every logged set across all sessions, newest first, searchable and editable.
  // Correcting a weight here re-persists its session, so the historical charts read the fixed value.
  import { goto } from '$app/navigation';
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Button from '$lib/components/Button.svelte';
  import NumField from '$lib/components/NumField.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import { store, type LogKey } from '$lib/store.svelte';
  import { unit, toUnit, fmtWeight, keepOrConvert, liftStep } from '$lib/units';
  import { parseYmd } from '$lib/dates';
  import type { SetLog } from '$lib/types';

  const PAGE = 40;

  type Row = {
    key: LogKey;
    log: SetLog;
    exName: string;
    where: string; // routine or "Extra workout"
    kind: 'hit' | 'missed' | 'extra' | 'skipped';
  };

  // Newest-first rows, one per logged set, with the context each row needs.
  const allRows = $derived.by<Row[]>(() => {
    const rows: Row[] = [];
    for (const s of store.sessions) {
      const where = s.routineId ? store.routine(s.routineId)?.name ?? 'Routine' : 'Extra workout';
      for (const log of s.logs) {
        const kind: Row['kind'] = !log.actual ? 'skipped' : log.goalSnapshot ? (log.hitGoal ? 'hit' : 'missed') : 'extra';
        rows.push({
          key: { sessionId: s.id, date: s.date, exerciseId: log.exerciseId, setIndex: log.setIndex },
          log,
          exName: store.exercise(log.exerciseId)?.name ?? 'Deleted exercise',
          where,
          kind
        });
      }
    }
    return rows.sort((a, b) => b.log.loggedAt.localeCompare(a.log.loggedAt) || b.key.date.localeCompare(a.key.date));
  });

  // ---- filters ----
  let q = $state('');
  let onDate = $state('');
  const filtered = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    return allRows.filter((r) =>
      (!needle || r.exName.toLowerCase().includes(needle)) && (!onDate || r.key.date === onDate));
  });

  // ---- pagination ("load more") ----
  let shown = $state(PAGE);
  // Reset the window whenever the filtered set changes.
  $effect(() => { q; onDate; shown = PAGE; });
  const visible = $derived(filtered.slice(0, shown));

  const fmtDate = (ymd: string) => parseYmd(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // ---- editing ----
  let editing = $state<Row | null>(null);
  let reps = $state(0);
  let weight = $state(0); // display units
  let origKg = 0;

  function open(r: Row) {
    editing = r;
    origKg = r.log.actual?.weight ?? r.log.goalSnapshot?.weight ?? 0;
    reps = r.log.actual?.reps ?? r.log.goalSnapshot?.reps ?? 0;
    weight = toUnit(origKg);
  }
  function save() {
    if (!editing) return;
    store.updateLog(editing.key, { reps, weight: keepOrConvert(origKg, weight) });
    editing = null;
  }
  function del() {
    if (!editing) return;
    store.deleteLog(editing.key);
    editing = null;
  }
</script>

<TopBar title="History" subtitle="EVERY LOGGED SET">
  {#snippet right()}<IconButton icon="settings" size={19} label="Settings" onclick={() => goto('/settings')} />{/snippet}
</TopBar>

<div class="filters">
  <div class="search">
    <Icon name="search" size={15} />
    <input placeholder="Search by exercise…" bind:value={q} aria-label="Search by exercise name" />
    {#if q}<button class="clear" onclick={() => (q = '')} aria-label="Clear search"><Icon name="x" size={14} /></button>{/if}
  </div>
  <div class="date">
    <input type="date" bind:value={onDate} max={store.todayStr} aria-label="Filter by date" />
    {#if onDate}<button class="clear" onclick={() => (onDate = '')} aria-label="Clear date filter"><Icon name="x" size={14} /></button>{/if}
  </div>
</div>

<div class="page">
  {#if !allRows.length}
    <div class="empty">
      <Label color="var(--text-low)">No logged sets yet</Label>
      <p>Log some sets from the Today tab and they'll show up here to review and fix.</p>
    </div>
  {:else}
    <Label size={9} color="var(--text-low)">{filtered.length} set{filtered.length === 1 ? '' : 's'}{q || onDate ? ' matched' : ''}</Label>

    <div class="list">
      {#each visible as r (r.key.sessionId + r.key.exerciseId + r.key.setIndex)}
        <button class="row" onclick={() => open(r)}>
          <div class="info">
            <div class="top">
              <span class="ex">{r.exName}</span>
              <span class="tag {r.kind}">{r.kind === 'hit' ? 'Hit' : r.kind === 'missed' ? 'Missed' : r.kind === 'skipped' ? 'Skipped' : 'Extra'}</span>
            </div>
            <div class="meta">{fmtDate(r.key.date)} · Set {r.log.setIndex + 1} · {r.where}</div>
          </div>
          <div class="vals">
            {#if r.log.actual}
              <span class="num">{r.log.actual.reps}<span class="x">×</span>{toUnit(r.log.actual.weight)}</span>
              <span class="u">{unit()}</span>
            {:else}
              <span class="num dim">—</span>
            {/if}
          </div>
          <Icon name="chev-r" size={14} />
        </button>
      {/each}
    </div>

    {#if visible.length < filtered.length}
      <Button variant="secondary" full onclick={() => (shown += PAGE)}>Load more ({filtered.length - visible.length} left)</Button>
    {:else if !filtered.length}
      <p class="muted">No sets match. Try clearing the search or date.</p>
    {/if}
  {/if}
</div>

<Sheet open={!!editing} onclose={() => (editing = null)} title="Edit set" height="auto">
  {#if editing}
    <div class="editor">
      <div class="ctx">
        <div class="ctx-ex">{editing.exName}</div>
        <div class="ctx-meta">{fmtDate(editing.key.date)} · Set {editing.log.setIndex + 1} · {editing.where}</div>
      </div>
      {#if editing.log.goalSnapshot}
        <div class="goal">
          <Label size={9} color="var(--text-low)">Goal</Label>
          <span class="goal-v">{editing.log.goalSnapshot.reps} × {fmtWeight(editing.log.goalSnapshot.weight)}</span>
        </div>
      {/if}
      <div class="fields">
        <NumField label="Reps" bind:value={reps} suffix="reps" />
        <NumField label="Weight" bind:value={weight} suffix={unit()} step={liftStep()} />
      </div>
      <div class="actions">
        <Button variant="danger" icon="trash" onclick={del}>Delete</Button>
        <Button full onclick={save}>Save</Button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .filters { display: flex; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .search { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 0 10px; color: var(--text-low); }
  .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text);
    font-family: var(--f-sans); font-size: 14px; padding: 9px 0; }
  .date { display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0 8px 0 10px; }
  .date input { background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-mono); font-size: 13px; color-scheme: inherit; padding: 9px 0; }
  .clear { background: transparent; border: none; color: var(--text-low); display: flex; cursor: pointer; padding: 4px; }

  .page { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; gap: 10px; text-align: left; width: 100%; cursor: pointer;
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 11px 12px; color: var(--text); }
  .row:hover { background: var(--surface-hi); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .top { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ex { font-family: var(--f-sans); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-family: var(--f-mono); font-size: 11px; letter-spacing: 0.3px; color: var(--text-low); }
  .tag { flex-shrink: 0; font-family: var(--f-cond); font-weight: 600; font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase;
    padding: 2px 6px; border-radius: 5px; border: 1px solid var(--border); color: var(--text-mid); }
  .tag.hit { color: var(--text); border-color: var(--border-hi); background: var(--log-hit); }
  .tag.missed { color: var(--text-mid); background: var(--log-miss); }
  .tag.extra { color: var(--text-mid); }
  .tag.skipped { color: var(--text-low); }
  .vals { flex-shrink: 0; display: flex; align-items: baseline; gap: 3px; }
  .num { font-family: var(--f-cond); font-weight: 700; font-size: 19px; font-variant-numeric: tabular-nums; }
  .num.dim { color: var(--text-low); }
  .num .x { color: var(--text-low); padding: 0 3px; font-size: 14px; }
  .u { font-family: var(--f-mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-low); }

  .empty { padding: 32px 18px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty p { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); max-width: 32ch; }
  .muted { margin: 4px 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); text-align: center; }

  .editor { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 16px; }
  .ctx { display: flex; flex-direction: column; gap: 3px; }
  .ctx-ex { font-family: var(--f-cond); font-weight: 600; font-size: 20px; letter-spacing: 0.3px; }
  .ctx-meta { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); }
  .goal { display: flex; align-items: center; justify-content: space-between; background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; }
  .goal-v { font-family: var(--f-cond); font-weight: 600; font-size: 16px; }
  .fields { display: flex; gap: 12px; }
  .actions { display: flex; gap: 10px; }
</style>
