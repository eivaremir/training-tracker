<script lang="ts">
  // Pick an exercise: the user's library first, then the public catalog.
  // Catalog picks are copied into the library (or reuse an existing copy).
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import { store } from '../store.svelte';
  import { loadCatalog, toExercise } from '../catalog';
  import { MUSCLES } from '../muscles';
  import { equipmentLabel } from '../equipment';
  import type { CatalogExercise, Exercise } from '../types';

  let { onpick }: { onpick: (ex: Exercise) => void } = $props();

  let q = $state('');
  let catalog = $state<Awaited<ReturnType<typeof loadCatalog>> | null>(null);
  let catalogError = $state(false);
  loadCatalog().then((c) => (catalog = c)).catch(() => (catalogError = true));

  const match = (name: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => name.toLowerCase().includes(w));
  const mine = $derived(store.exercises.filter((e) => match(e.name)));
  const owned = $derived(new Set(store.exercises.map((e) => e.sourceId).filter(Boolean)));
  const fromCatalog = $derived(catalog ? catalog.exercises.filter((c) => !owned.has(c.id) && match(c.name)).slice(0, q ? 40 : 20) : []);

  function pickCatalog(c: CatalogExercise) {
    const existing = store.exercises.find((e) => e.sourceId === c.id);
    if (existing) return onpick(existing);
    const ex = toExercise(c, catalog!.imageBase);
    store.saveExercise(ex);
    onpick(ex);
  }
</script>

<div class="picker">
  <label class="search">
    <Icon name="search" size={14} />
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={q} placeholder="Search exercises…" aria-label="Search exercises" autofocus />
  </label>

  <div class="section"><Label>My library · {mine.length}</Label></div>
  {#each mine as ex (ex.id)}
    <button class="list-btn" onclick={() => onpick(ex)}>
      <ExerciseThumb name={ex.name} muscles={ex.muscles} size={36} />
      <div class="txt">
        <div class="cond" style="font-size:14px">{ex.name}</div>
        {#if ex.equipment?.length}<Label size={9} color="var(--text-low)">{equipmentLabel(ex.equipment)}</Label>{/if}
      </div>
      <Icon name="plus" size={14} />
    </button>
  {:else}
    <p class="empty">{q ? 'No matches in your library.' : 'Your library is empty. Pick from the catalog below.'}</p>
  {/each}

  <div class="section"><Label>Public catalog</Label><Label size={9} color="var(--text-low)">adds to your library</Label></div>
  {#if catalogError}
    <p class="empty">Couldn't load the catalog.</p>
  {:else if !catalog}
    <p class="empty">Loading…</p>
  {:else}
    {#each fromCatalog as c (c.id)}
      <button class="list-btn" onclick={() => pickCatalog(c)}>
        <ExerciseThumb name={c.name} muscles={c.muscles} size={36} />
        <div class="txt">
          <div class="cond" style="font-size:14px">{c.name}</div>
          <Label size={9} color="var(--text-low)">{c.muscles.primary.map((m) => MUSCLES[m]).join(' · ')}{c.equipment.length ? ' · ' + equipmentLabel(c.equipment) : ''}</Label>
        </div>
        <Icon name="plus" size={14} />
      </button>
    {:else}
      <p class="empty">No catalog matches.</p>
    {/each}
    {#if !q}<p class="empty">Search to see all {catalog.exercises.length} exercises.</p>{/if}
  {/if}
</div>

<style>
  .picker { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
  .search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text); }
  .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-sans); font-size: 13px; }
  .section { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 2px 2px; }
  .txt { flex: 1; min-width: 0; }
  .list-btn { padding: 10px 12px; }
  .empty { margin: 4px 2px; font-family: var(--f-sans); font-size: 12px; color: var(--text-low); }
</style>
