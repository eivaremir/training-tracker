<script lang="ts">
  // Browse exercises from the user's library or the public catalog.
  // Cards: Equipment → Muscle group → swipeable exercise cards. List: flat, searchable, filterable.
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';
  import MuscleThumb from './MuscleThumb.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import ExerciseGuide from './ExerciseGuide.svelte';
  import EquipmentIcon from './EquipmentIcon.svelte';
  import MediaCarousel from './MediaCarousel.svelte';
  import { loadCatalog, toExercise } from '../catalog';
  import { MUSCLES, PARENT } from '../muscles';
  import { EQUIPMENT, equipmentLabel } from '../equipment';
  import { store } from '../store.svelte';
  import type { CatalogExercise, Exercise, Muscles } from '../types';

  /** Browse position and filters; owned by the parent so they survive switching source. */
  export interface BrowseState { eq: string | null; grp: string | null; q: string; muscle: string; equip: string }

  let { source, view, onopen, onedit, nav = $bindable() }: {
    source: 'mine' | 'catalog';
    view: 'cards' | 'list';
    onopen: (ex: Exercise) => void;
    onedit: (ex: Exercise) => void;
    nav: BrowseState;
  } = $props();

  interface Item {
    key: string; name: string; muscles: Muscles; equipment: string[]; images: string[];
    level: string | null; category: string | null; instructions: string[];
    mine?: Exercise; cat?: CatalogExercise;
  }

  const PAGE = 20;
  const GROUPS = Object.keys(MUSCLES).filter((k) => !PARENT[k]);
  const NONE = 'unassigned';
  const ALL = '*';

  let catalog = $state<Awaited<ReturnType<typeof loadCatalog>> | null>(null);
  let catalogError = $state(false);
  const loadCat = () => { catalogError = false; loadCatalog().then((c) => (catalog = c)).catch(() => (catalogError = true)); };
  $effect(() => { if (source === 'catalog' && !catalog) loadCat(); });

  let limit = $state(PAGE);
  let selected = $state<Item | null>(null);
  $effect(() => { source; view; nav.eq; nav.grp; nav.q; nav.muscle; nav.equip; limit = PAGE; });

  const owned = $derived(new Set(store.exercises.map((e) => e.sourceId).filter(Boolean)));
  const items = $derived.by((): Item[] => {
    if (source === 'mine') {
      return store.exercises.map((e) => ({
        key: e.id, name: e.name, muscles: e.muscles, equipment: e.equipment ?? [], images: e.images ?? [],
        level: e.level ?? null, category: e.category ?? null, instructions: e.instructions ?? [], mine: e
      }));
    }
    if (!catalog) return [];
    const base = catalog.imageBase;
    return catalog.exercises.map((c) => ({
      key: c.id, name: c.name, muscles: c.muscles, equipment: c.equipment, images: c.images.map((p) => base + p),
      level: c.level, category: c.category, instructions: c.instructions, cat: c
    }));
  });

  const equipOf = (i: Item) => (i.equipment.length ? i.equipment : ['other']);
  const groupsOf = (i: Item) => {
    const g = [...new Set(i.muscles.primary.map((m) => PARENT[m] || m))];
    return g.length ? g : [NONE];
  };

  // Free-text finder: every word must appear in the name, a muscle or an equipment label.
  const words = $derived(nav.q.toLowerCase().split(/\s+/).filter(Boolean));
  const haystack = (i: Item) => [i.name, ...[...i.muscles.primary, ...i.muscles.secondary].map((m) => MUSCLES[m] ?? m),
    ...i.equipment.map((e) => EQUIPMENT[e] ?? e)].join(' ').toLowerCase();
  const matches = (i: Item) => words.every((w) => haystack(i).includes(w));

  const equipCards = $derived.by(() => {
    const n: Record<string, number> = {};
    items.forEach((i) => equipOf(i).forEach((e) => (n[e] = (n[e] || 0) + 1)));
    return Object.keys(EQUIPMENT).filter((e) => n[e]).map((e) => ({ id: e, count: n[e] }));
  });
  const inEquip = $derived(!nav.eq ? [] : nav.eq === ALL ? items : items.filter((i) => equipOf(i).includes(nav.eq!)));
  const muscleCards = $derived.by(() => {
    const n: Record<string, number> = {};
    inEquip.forEach((i) => groupsOf(i).forEach((g) => (n[g] = (n[g] || 0) + 1)));
    return [...GROUPS, NONE].filter((g) => n[g]).map((g) => ({ id: g, count: n[g] }));
  });
  const cardItems = $derived(!nav.grp ? [] : nav.grp === ALL ? inEquip : inEquip.filter((i) => groupsOf(i).includes(nav.grp!)));
  // While searching, an unset level counts as "all", so results stay scoped to whatever is already picked.
  const searchItems = $derived(words.length ? items.filter((i) =>
    (!nav.eq || nav.eq === ALL || equipOf(i).includes(nav.eq)) &&
    (!nav.grp || nav.grp === ALL || groupsOf(i).includes(nav.grp)) && matches(i)) : []);
  const shown = $derived(words.length ? searchItems : cardItems);
  const ALL_BODY: Muscles = { primary: GROUPS, secondary: [] };

  const listItems = $derived.by(() => {
    return items.filter((i) =>
      matches(i) &&
      (!nav.muscle || groupsOf(i).includes(nav.muscle)) &&
      (!nav.equip || equipOf(i).includes(nav.equip)));
  });

  const groupLabel = (g: string) => (g === ALL ? 'All muscle groups' : g === NONE ? 'No muscles set' : MUSCLES[g]);
  const eqLabel = (e: string) => (e === ALL ? 'All equipment' : EQUIPMENT[e]);
  const muscleSummary = (i: Item) => i.muscles.primary.map((m) => MUSCLES[m] ?? m).join(' · ');

  function open(i: Item) { if (i.mine) onopen(i.mine); else selected = i; }
  function add(i: Item) {
    if (!i.cat || !catalog || owned.has(i.cat.id)) return;
    store.saveExercise(toExercise(i.cat, catalog.imageBase));
  }
</script>

{#snippet action(i: Item)}
  {#if i.mine}
    <button class="act ghost" onclick={() => onedit(i.mine!)} aria-label="Edit {i.name}"><Icon name="edit" size={14} /></button>
  {:else}
    {@const have = owned.has(i.cat!.id)}
    <button class="act" class:have onclick={() => add(i)} disabled={have} aria-label={have ? `${i.name} is in your library` : `Add ${i.name} to your library`}>
      <Icon name={have ? 'check' : 'plus'} size={14} />
    </button>
  {/if}
{/snippet}

{#if source === 'catalog' && catalogError}
  <div class="empty"><Label color="var(--danger)">Couldn't load the catalog.</Label><Button size="sm" variant="secondary" onclick={loadCat}>Retry</Button></div>
{:else if source === 'catalog' && !catalog}
  <div class="empty"><Label color="var(--text-low)">Loading catalog…</Label></div>
{:else if !items.length}
  <div class="empty">
    <Label color="var(--text-low)">Your library is empty</Label>
    <p>Switch to <strong>Catalog</strong> to add exercises, or create your own with <strong>+</strong>.</p>
  </div>
{:else if view === 'cards'}
  <div class="finder">
    <label class="search">
      <Icon name="search" size={14} />
      <input bind:value={nav.q} placeholder="Find: name, muscle, equipment…" aria-label="Find exercises" />
      {#if nav.q}<button class="clear" onclick={() => (nav.q = '')} aria-label="Clear search"><Icon name="x" size={14} /></button>{/if}
    </label>
  </div>
  <nav class="crumbs" aria-label="Browse path">
    <button class:cur={!nav.eq} onclick={() => { nav.eq = null; nav.grp = null; }}>Equipment</button>
    {#if nav.eq}<Icon name="chev-r" size={12} /><button class:cur={!nav.grp} onclick={() => (nav.grp = null)}>{eqLabel(nav.eq)}</button>{/if}
    {#if nav.grp}<Icon name="chev-r" size={12} /><span class="cur">{groupLabel(nav.grp)}</span>{/if}
    {#if words.length}<span class="count">{searchItems.length} result{searchItems.length === 1 ? '' : 's'}</span>{/if}
  </nav>

  {#if words.length && !searchItems.length}
    <div class="empty">
      <Label color="var(--text-low)">No exercises match “{nav.q}”{nav.eq && nav.eq !== ALL ? ` in ${eqLabel(nav.eq)}` : ''}{nav.grp && nav.grp !== ALL ? ` · ${groupLabel(nav.grp)}` : ''}</Label>
      <Button size="sm" variant="secondary" onclick={() => (nav.q = '')}>Clear search</Button>
    </div>
  {:else if !words.length && nav.eq && !inEquip.length}
    <div class="empty">
      <Label color="var(--text-low)">No {eqLabel(nav.eq)} exercises in {source === 'mine' ? 'your library' : 'the catalog'}</Label>
      <Button size="sm" variant="secondary" onclick={() => { nav.eq = null; nav.grp = null; }}>All equipment</Button>
    </div>
  {:else if !words.length && nav.grp && !cardItems.length}
    <div class="empty">
      <Label color="var(--text-low)">No {eqLabel(nav.eq!)} · {groupLabel(nav.grp)} exercises in {source === 'mine' ? 'your library' : 'the catalog'}</Label>
      <Button size="sm" variant="secondary" onclick={() => (nav.grp = null)}>Back to {eqLabel(nav.eq!)}</Button>
    </div>
  {:else if !words.length && !nav.eq}
    <div class="grid">
      <button class="tile" onclick={() => (nav.eq = ALL)}>
        <span class="tile-icon"><Icon name="grid" size={28} /></span>
        <span class="tile-name">All equipment</span>
        <Label size={9} color="var(--text-low)">{items.length} exercise{items.length === 1 ? '' : 's'}</Label>
      </button>
      {#each equipCards as c (c.id)}
        <button class="tile" onclick={() => (nav.eq = c.id)}>
          <span class="tile-icon"><EquipmentIcon id={c.id} size={30} /></span>
          <span class="tile-name">{EQUIPMENT[c.id]}</span>
          <Label size={9} color="var(--text-low)">{c.count} exercise{c.count === 1 ? '' : 's'}</Label>
        </button>
      {/each}
    </div>
  {:else if !words.length && !nav.grp}
    <div class="grid">
      <button class="tile" onclick={() => (nav.grp = ALL)}>
        <MuscleThumb muscles={ALL_BODY} size={72} />
        <span class="tile-name">All muscle groups</span>
        <Label size={9} color="var(--text-low)">{inEquip.length} exercise{inEquip.length === 1 ? '' : 's'}</Label>
      </button>
      {#each muscleCards as c (c.id)}
        <button class="tile" onclick={() => (nav.grp = c.id)}>
          <MuscleThumb muscles={{ primary: c.id === NONE ? [] : [c.id], secondary: [] }} size={72} />
          <span class="tile-name">{groupLabel(c.id)}</span>
          <Label size={9} color="var(--text-low)">{c.count} exercise{c.count === 1 ? '' : 's'}</Label>
        </button>
      {/each}
    </div>
  {:else}
    <div class="cards r-grid">
      {#each shown.slice(0, limit) as i (i.key)}
        <article class="xcard">
          <MediaCarousel images={i.images} muscles={i.muscles} name={i.name} />
          <div class="xinfo">
            <button class="xtitle" onclick={() => open(i)}>
              <span class="xname">{i.name}</span>
              <Label size={9} color="var(--text-low)">{muscleSummary(i)}{i.equipment.length ? ' · ' + equipmentLabel(i.equipment) : ''}{i.level ? ' · ' + i.level : ''}</Label>
            </button>
            {@render action(i)}
          </div>
        </article>
      {/each}
      {#if shown.length > limit}<button class="dashed-btn" onclick={() => (limit += PAGE)}>Show more ({shown.length - limit})</button>{/if}
    </div>
  {/if}
{:else}
  <div class="filters">
    <label class="search">
      <Icon name="search" size={14} />
      <input bind:value={nav.q} placeholder="Search {items.length} exercises…" aria-label="Search exercises" />
    </label>
    <div class="selects">
      <select bind:value={nav.muscle} aria-label="Filter by muscle">
        <option value="">All muscles</option>
        {#each GROUPS as g (g)}<option value={g}>{MUSCLES[g]}</option>{/each}
      </select>
      <select bind:value={nav.equip} aria-label="Filter by equipment">
        <option value="">All equipment</option>
        {#each Object.entries(EQUIPMENT) as [id, label] (id)}<option value={id}>{label}</option>{/each}
      </select>
    </div>
    <Label size={9} color="var(--text-low)">{listItems.length} result{listItems.length === 1 ? '' : 's'}</Label>
  </div>
  <div class="rows">
    {#each listItems.slice(0, limit * 2) as i (i.key)}
      <div class="row card">
        <button class="main" onclick={() => open(i)}>
          <ExerciseThumb name={i.name} muscles={i.muscles} images={i.images} size={48} />
          <div class="txt">
            <div class="xname">{i.name}</div>
            <Label size={9} color="var(--text-low)">{muscleSummary(i)}{i.equipment.length ? ' · ' + equipmentLabel(i.equipment) : ''}</Label>
          </div>
        </button>
        {@render action(i)}
      </div>
    {/each}
    {#if listItems.length > limit * 2}<button class="dashed-btn" onclick={() => (limit += PAGE)}>Show more ({listItems.length - limit * 2})</button>{/if}
  </div>
{/if}

{#if source === 'catalog' && catalog}
  <p class="credit">Exercise data: <a href={catalog.source} target="_blank" rel="noopener noreferrer">free-exercise-db</a> · public domain</p>
{/if}

<Sheet open={!!selected} onclose={() => (selected = null)} title={selected?.name} height="92vh">
  {#if selected}
    {@const i = selected}
    <div class="detail">
      <ExerciseGuide muscles={i.muscles} equipment={i.equipment} instructions={i.instructions} images={i.images} level={i.level} category={i.category} />
      {#if i.cat}
        {@const have = owned.has(i.cat.id)}
        <Button full size="lg" icon={have ? 'check' : 'plus'} disabled={have} onclick={() => add(i)}>{have ? 'In your library' : 'Add to my library'}</Button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .empty { padding: 32px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty p { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
  .crumbs { padding: 12px 14px 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--text-low); }
  .crumbs button, .crumbs span { background: none; border: none; padding: 0; cursor: pointer; color: var(--text-mid);
    font-family: var(--f-mono); font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .crumbs .cur { color: var(--text); cursor: default; }
  .crumbs .count { margin-left: auto; cursor: default; color: var(--text-low); }
  .finder { padding: 12px 12px 0; }
  .clear { background: none; border: none; padding: 0 2px; color: var(--text-mid); cursor: pointer; display: flex; }
  .grid { padding: 8px 12px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
  .tile { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 10px 14px; cursor: pointer; text-align: center;
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px; color: var(--text); }
  .tile:hover { border-color: var(--border-hi); }
  .tile-icon { width: 60px; height: 60px; border-radius: 14px; background: var(--bg); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; }
  .tile-name { font-family: var(--f-cond); font-weight: 600; font-size: 16px; letter-spacing: 0.3px; }
  .cards { padding: 8px 12px 16px; display: flex; flex-direction: column; gap: 12px; }
  .xcard { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .xinfo { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; }
  .xtitle { flex: 1; min-width: 0; background: none; border: none; padding: 0; text-align: left; cursor: pointer; color: var(--text); display: flex; flex-direction: column; gap: 3px; }
  .xname { font-family: var(--f-cond); font-weight: 600; font-size: 17px; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act { width: 36px; height: 36px; border-radius: 18px; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;
    background: var(--text); color: var(--bg); border: none; }
  .act.have { background: var(--surface-hi); color: var(--text-mid); border: 1px solid var(--border-hi); cursor: default; }
  .act.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .filters { padding: 12px 12px 4px; display: flex; flex-direction: column; gap: 8px; }
  .search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; color: var(--text); }
  .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-sans); font-size: 16px; }
  .selects { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  select { appearance: none; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; color: var(--text);
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .rows { padding: 8px 12px 16px; }
  .row { margin-bottom: 8px; display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 12px; }
  .main { flex: 1; min-width: 0; background: transparent; border: none; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left; padding: 0; color: var(--text); }
  .txt { flex: 1; min-width: 0; }
  .credit { margin: 4px 0 20px; text-align: center; font-family: var(--f-mono); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-low); }
  .credit a { color: var(--text-mid); }
  .detail { padding: 16px 18px 24px; display: flex; flex-direction: column; gap: 18px; }
</style>
