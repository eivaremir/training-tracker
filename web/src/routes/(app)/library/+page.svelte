<script lang="ts">
  // Library — exercises from your library or the public catalog, as cards or a list.
  // Routines are managed under Plans.
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ExerciseEditor from '$lib/components/ExerciseEditor.svelte';
  import ExerciseDetails from '$lib/components/ExerciseDetails.svelte';
  import ExerciseBrowser, { type BrowseState } from '$lib/components/ExerciseBrowser.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { store } from '$lib/store.svelte';
  import type { Exercise } from '$lib/types';

  const readPref = <T extends string>(key: string, fallback: T): T => { try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; } };
  const writePref = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } };

  // ?muscle=<group> (dashboard "not trained" links): open the catalog's exercises for that group.
  const linkMuscle = page.url.searchParams.get('muscle');
  let source = $state<'mine' | 'catalog'>(linkMuscle || !store.exercises.length ? 'catalog' : 'mine');
  let view = $state<'cards' | 'list'>(readPref('tt-lib-view', 'cards'));
  const setView = (v: 'cards' | 'list') => { view = v; writePref('tt-lib-view', v); };

  // Browse position/filters, shared by Mine and Catalog and kept for this browser session.
  const NAV_KEY = 'tt-lib-nav';
  const emptyNav = (): BrowseState => ({ eq: null, grp: null, q: '', muscle: '', equip: '' });
  let nav = $state<BrowseState>((() => {
    // '*' is ExerciseBrowser's "all equipment", so the cards go straight to the group's exercises.
    if (linkMuscle) return { ...emptyNav(), eq: '*', grp: linkMuscle, muscle: linkMuscle };
    try { return { ...emptyNav(), ...JSON.parse(sessionStorage.getItem(NAV_KEY) || '{}') }; } catch { return emptyNav(); }
  })());
  // Drop the query once applied, so a reload restores the remembered browse position instead.
  onMount(() => { if (linkMuscle) replaceState('/library', {}); });
  $effect(() => { const v = JSON.stringify(nav); try { sessionStorage.setItem(NAV_KEY, v); } catch { /* private mode */ } });

  let detailTab = $state<'guide' | 'stats'>('guide');
  let openEx = $state<Exercise | null>(null);
  let editingEx = $state<Exercise | null>(null);
  let creatingEx = $state(false);

  const saveEx = (ex: Exercise) => { store.saveExercise(ex); editingEx = null; creatingEx = false; };
  const removeEx = (id: string) => { store.deleteExercise(id); editingEx = null; };
</script>

<TopBar title="Library" subtitle="EXERCISES">
  {#snippet right()}
    <IconButton icon="plus" label="New exercise" onclick={() => (creatingEx = true)} />
  {/snippet}
</TopBar>


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
  <ExerciseBrowser {source} {view} bind:nav
    onopen={(ex) => { detailTab = 'guide'; openEx = ex; }}
    onedit={(ex) => (editingEx = ex)} />

<Sheet open={!!openEx} onclose={() => (openEx = null)} title={openEx?.name} height="92vh">
  {#if openEx}
    {@const ex = openEx}
    <ExerciseDetails exercise={ex} bind:tab={detailTab}>
      {#snippet footer()}
        {#if !ex.instructions?.length && !ex.images?.length}
          <p class="hint">Add instructions from <strong>Edit</strong>, or add this movement from the catalog for photos and steps.</p>
        {/if}
        <button class="dashed-btn" onclick={() => { editingEx = ex; openEx = null; }}><Icon name="edit" size={14} /> Edit exercise</button>
      {/snippet}
    </ExerciseDetails>
  {/if}
</Sheet>
<Sheet open={!!editingEx} onclose={() => (editingEx = null)} title="Edit · {editingEx?.name}" height="92vh">
  {#if editingEx}{#key editingEx.id}<ExerciseEditor exercise={editingEx} onsave={saveEx} oncancel={() => (editingEx = null)} ondelete={removeEx} />{/key}{/if}
</Sheet>
<Sheet open={creatingEx} onclose={() => (creatingEx = false)} title="New exercise" height="92vh">
  {#if creatingEx}<ExerciseEditor onsave={saveEx} oncancel={() => (creatingEx = false)} />{/if}
</Sheet>

<style>
  .toolbar { padding: 12px 12px 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .pill button { padding: 8px 14px; border: none; cursor: pointer; background: transparent; color: var(--text-mid); display: flex; align-items: center;
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .hint { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
</style>
