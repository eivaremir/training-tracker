<script lang="ts">
  // Library — exercises (mine / public catalog, cards or list) and routines.
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ExerciseEditor from '$lib/components/ExerciseEditor.svelte';
  import ExerciseStats from '$lib/components/ExerciseStats.svelte';
  import ExerciseGuide from '$lib/components/ExerciseGuide.svelte';
  import ExerciseBrowser from '$lib/components/ExerciseBrowser.svelte';
  import RoutineEditor from '$lib/components/RoutineEditor.svelte';
  import { store } from '$lib/store.svelte';
  import type { Exercise, Routine } from '$lib/types';

  const readPref = <T extends string>(key: string, fallback: T): T => { try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; } };
  const writePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

  let tab = $state<'exercises' | 'routines'>('exercises');
  let source = $state<'mine' | 'catalog'>(store.exercises.length ? 'mine' : 'catalog');
  let view = $state<'cards' | 'list'>(readPref('tt-lib-view', 'cards'));
  const setView = (v: 'cards' | 'list') => { view = v; writePref('tt-lib-view', v); };

  let detailTab = $state<'guide' | 'stats'>('guide');
  let openEx = $state<Exercise | null>(null);
  let editingEx = $state<Exercise | null>(null);
  let creatingEx = $state(false);
  let editingRt = $state<Routine | null>(null);
  let creatingRt = $state(false);
  let rtQuery = $state('');

  const saveEx = (ex: Exercise) => { store.saveExercise(ex); editingEx = null; creatingEx = false; };
  const removeEx = (id: string) => { store.deleteExercise(id); editingEx = null; };
  const saveRt = (r: Routine) => { store.saveRoutine(r); editingRt = null; creatingRt = false; };
  const removeRt = (id: string) => { store.deleteRoutine(id); editingRt = null; };
</script>

<TopBar title="Library" subtitle="EXERCISES & ROUTINES">
  {#snippet right()}
    <IconButton icon="plus" label="New {tab === 'routines' ? 'routine' : 'exercise'}" onclick={() => (tab === 'routines' ? (creatingRt = true) : (creatingEx = true))} />
  {/snippet}
</TopBar>

<div class="seg-tabs">
  <button class:on={tab === 'exercises'} onclick={() => (tab = 'exercises')}>exercises <span>{store.exercises.length}</span></button>
  <button class:on={tab === 'routines'} onclick={() => (tab = 'routines')}>routines <span>{store.routines.length}</span></button>
</div>

{#if tab === 'exercises'}
  <div class="toolbar">
    <div class="pill" role="tablist" aria-label="Exercise source">
      <button role="tab" aria-selected={source === 'mine'} class:on={source === 'mine'} onclick={() => (source = 'mine')}>Mine</button>
      <button role="tab" aria-selected={source === 'catalog'} class:on={source === 'catalog'} onclick={() => (source = 'catalog')}>Catalog</button>
    </div>
    <div class="pill" aria-label="View">
      <button class:on={view === 'cards'} onclick={() => setView('cards')} aria-label="Card view" aria-pressed={view === 'cards'}><Icon name="grid" size={15} /></button>
      <button class:on={view === 'list'} onclick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}><Icon name="list" size={15} /></button>
    </div>
  </div>
  {#key source}
    <ExerciseBrowser {source} {view}
      onopen={(ex) => { detailTab = 'guide'; openEx = ex; }}
      onedit={(ex) => (editingEx = ex)} />
  {/key}
{:else}
  <div style="padding:12px 12px 4px">
    <label class="search">
      <Icon name="search" size={14} />
      <input bind:value={rtQuery} placeholder="Search routines…" aria-label="Search routines" />
    </label>
  </div>
  <div class="list">
    {#each store.routines.filter((r) => r.name.toLowerCase().includes(rtQuery.toLowerCase())) as r (r.id)}
      <button class="rt card" onclick={() => (editingRt = r)}>
        <div style="flex:1">
          <div class="cond" style="font-size:18px;letter-spacing:0.2px">{r.name}</div>
          <Label size={9} color="var(--text-low)">{r.exercises.length} exercises · {r.exercises.reduce((s, e) => s + e.goals.length, 0)} sets</Label>
        </div>
        <Icon name="chev-r" size={16} />
      </button>
    {/each}
    <button class="dashed-btn" style="margin-top:8px" onclick={() => (creatingRt = true)}><Icon name="plus" size={14} /> New routine</button>
  </div>
{/if}

<Sheet open={!!openEx} onclose={() => (openEx = null)} title={openEx?.name} height="92vh">
  {#if openEx}
    {@const ex = openEx}
    <div class="seg-tabs" style="padding-top:12px">
      <button class:on={detailTab === 'guide'} onclick={() => (detailTab = 'guide')}>Guide</button>
      <button class:on={detailTab === 'stats'} onclick={() => (detailTab = 'stats')}>Stats</button>
    </div>
    {#if detailTab === 'guide'}
      <div style="padding:16px 18px 24px">
        <ExerciseGuide muscles={ex.muscles} equipment={ex.equipment} instructions={ex.instructions} images={ex.images} level={ex.level} category={ex.category} />
        {#if !ex.instructions?.length && !ex.images?.length}
          <p class="hint">Add instructions from <strong>Edit</strong>, or add this movement from the catalog for photos and steps.</p>
        {/if}
        <button class="dashed-btn" style="margin-top:16px" onclick={() => { editingEx = ex; openEx = null; }}><Icon name="edit" size={14} /> Edit exercise</button>
      </div>
    {:else}
      <ExerciseStats exerciseId={ex.id} />
    {/if}
  {/if}
</Sheet>
<Sheet open={!!editingEx} onclose={() => (editingEx = null)} title="Edit · {editingEx?.name}" height="92vh">
  {#if editingEx}{#key editingEx.id}<ExerciseEditor exercise={editingEx} onsave={saveEx} oncancel={() => (editingEx = null)} ondelete={removeEx} />{/key}{/if}
</Sheet>
<Sheet open={creatingEx} onclose={() => (creatingEx = false)} title="New exercise" height="92vh">
  {#if creatingEx}<ExerciseEditor onsave={saveEx} oncancel={() => (creatingEx = false)} />{/if}
</Sheet>
<Sheet open={!!editingRt} onclose={() => (editingRt = null)} title="Edit · {editingRt?.name}" height="94vh">
  {#if editingRt}{#key editingRt.id}<RoutineEditor routine={editingRt} onsave={saveRt} oncancel={() => (editingRt = null)} ondelete={removeRt} />{/key}{/if}
</Sheet>
<Sheet open={creatingRt} onclose={() => (creatingRt = false)} title="New routine" height="94vh">
  {#if creatingRt}<RoutineEditor onsave={saveRt} oncancel={() => (creatingRt = false)} />{/if}
</Sheet>

<style>
  .toolbar { padding: 12px 12px 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .pill button { padding: 8px 14px; border: none; cursor: pointer; background: transparent; color: var(--text-mid); display: flex; align-items: center;
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; color: var(--text); }
  .search input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-sans); font-size: 13px; }
  .list { padding: 8px 12px 24px; }
  .rt { width: 100%; padding: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left; color: var(--text); }
  .hint { margin: 14px 0 0; font-family: var(--f-sans); font-size: 12px; color: var(--text-mid); line-height: 1.5; }
</style>
