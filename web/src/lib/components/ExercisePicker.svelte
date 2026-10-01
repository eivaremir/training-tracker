<script lang="ts">
  // Pick an exercise: the user's library first, then the public catalog.
  // Catalog picks are copied into the library (or reuse an existing copy).
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import MediaCarousel from './MediaCarousel.svelte';
  import { store } from '../store.svelte';
  import { loadCatalog, toExercise } from '../catalog';
  import { MUSCLES } from '../muscles';
  import { equipmentLabel } from '../equipment';
  import type { CatalogExercise, Exercise } from '../types';

  let { onpick }: { onpick: (ex: Exercise) => void } = $props();

  let q = $state('');
  // Cards (photos + muscle map) or a compact list; remembered on this device.
  const VIEW_KEY = 'tt-picker-view';
  let view = $state<'cards' | 'list'>((() => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'; } catch { return 'cards'; } })());
  const setView = (v: 'cards' | 'list') => { view = v; try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const photos = (urls: string[] = []) => urls.filter((u) => u.startsWith('https://'));
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

{#snippet card(name: string, meta: string, images: string[], muscles: Exercise['muscles'], pick: () => void)}
  <article class="xcard">
    <MediaCarousel {images} {muscles} {name} />
    <button class="xinfo" onclick={pick} aria-label="Pick {name}">
      <span class="xtxt"><span class="cond xname">{name}</span>{#if meta}<Label size={9} color="var(--text-low)">{meta}</Label>{/if}</span>
      <span class="xadd"><Icon name="plus" size={14} /></span>
    </button>
  </article>
{/snippet}

<div class="picker">
  <div class="bar">
    <label class="search">
      <Icon name="search" size={14} />
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={q} placeholder="Search exercises…" aria-label="Search exercises" autofocus />
    </label>
    <div class="pill" role="tablist" aria-label="View">
      <button role="tab" aria-selected={view === 'cards'} class:on={view === 'cards'} onclick={() => setView('cards')} aria-label="Cards"><Icon name="grid" size={14} /></button>
      <button role="tab" aria-selected={view === 'list'} class:on={view === 'list'} onclick={() => setView('list')} aria-label="List"><Icon name="list" size={14} /></button>
    </div>
  </div>

  <div class="section"><Label>My library · {mine.length}</Label></div>
  {#if view === 'cards' && mine.length}
    <div class="cards">
      {#each mine as ex (ex.id)}{@render card(ex.name, equipmentLabel(ex.equipment ?? []), photos(ex.images), ex.muscles, () => onpick(ex))}{/each}
    </div>
  {:else}
  {#each mine as ex (ex.id)}
    <button class="list-btn" onclick={() => onpick(ex)}>
      <ExerciseThumb name={ex.name} muscles={ex.muscles} images={ex.images} size={36} />
      <div class="txt">
        <div class="cond" style="font-size:14px">{ex.name}</div>
        {#if ex.equipment?.length}<Label size={9} color="var(--text-low)">{equipmentLabel(ex.equipment)}</Label>{/if}
      </div>
      <Icon name="plus" size={14} />
    </button>
  {:else}
    <p class="empty">{q ? 'No matches in your library.' : 'Your library is empty. Pick from the catalog below.'}</p>
  {/each}
  {/if}

  <div class="section"><Label>Public catalog</Label><Label size={9} color="var(--text-low)">adds to your library</Label></div>
  {#if catalogError}
    <p class="empty">Couldn't load the catalog.</p>
  {:else if !catalog}
    <p class="empty">Loading…</p>
  {:else if view === 'cards' && fromCatalog.length}
    <div class="cards">
      {#each fromCatalog as c (c.id)}
        {@render card(c.name, [c.muscles.primary.map((m) => MUSCLES[m]).join(' · '), equipmentLabel(c.equipment)].filter(Boolean).join(' · '),
          c.images.map((p) => catalog!.imageBase + p), c.muscles, () => pickCatalog(c))}
      {/each}
    </div>
    {#if !q}<p class="empty">Search to see all {catalog.exercises.length} exercises.</p>{/if}
  {:else}
    {#each fromCatalog as c (c.id)}
      <button class="list-btn" onclick={() => pickCatalog(c)}>
        <ExerciseThumb name={c.name} muscles={c.muscles} images={c.images.slice(0, 1).map((p) => catalog!.imageBase + p)} size={36} />
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
  .bar { display: flex; gap: 8px; align-items: stretch; }
  .bar .search { flex: 1; min-width: 0; }
  .pill { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
  .pill button { padding: 0 12px; border: none; cursor: pointer; background: transparent; color: var(--text-mid); display: flex; align-items: center; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
  .xcard { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .xinfo { flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px; background: none; border: none; border-top: 1px solid var(--border);
    color: var(--text); cursor: pointer; text-align: left; }
  .xtxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .xname { font-size: 14px; line-height: 1.2; }
  .xadd { width: 28px; height: 28px; flex-shrink: 0; border-radius: 14px; background: var(--text); color: var(--bg); display: flex; align-items: center; justify-content: center; }
  .search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; color: var(--text); }
  .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-sans); font-size: 16px; }
  .section { display: flex; justify-content: space-between; align-items: baseline; margin: 10px 2px 2px; }
  .txt { flex: 1; min-width: 0; }
  .list-btn { padding: 10px 12px; }
  .empty { margin: 4px 2px; font-family: var(--f-sans); font-size: 13px; color: var(--text-low); }
</style>
