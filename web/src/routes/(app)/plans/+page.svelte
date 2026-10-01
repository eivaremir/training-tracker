<script lang="ts">
  // Plans hub — plans (subscribe, create, edit, delete) and the routines they schedule.
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Button from '$lib/components/Button.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import PlanEditor from '$lib/components/PlanEditor.svelte';
  import RoutineEditor from '$lib/components/RoutineEditor.svelte';
  import MuscleThumb from '$lib/components/MuscleThumb.svelte';
  import { store } from '$lib/store.svelte';
  import { WEEK_MON } from '$lib/dates';
  import { routinesOn } from '$lib/plans';
  import type { Muscles, Plan, Routine } from '$lib/types';

  // Which section is open is remembered for the session.
  const readSection = (): 'plans' | 'routines' => { try { return (sessionStorage.getItem('tt-plans-section') as 'routines') || 'plans'; } catch { return 'plans'; } };
  let section = $state<'plans' | 'routines'>(readSection());
  $effect(() => { const v = section; try { sessionStorage.setItem('tt-plans-section', v); } catch { /* ignore */ } });

  let tab = $state<'subscribed' | 'all'>('subscribed');
  let editing = $state<Plan | null>(null);
  let creating = $state(false);
  let deleting = $state<Plan | null>(null);

  const subscribed = $derived(store.plans.filter((p) => p.subscribed));
  const others = $derived(store.plans.filter((p) => !p.subscribed));
  const list = $derived(tab === 'subscribed' ? subscribed : others);
  const MONTH = Array.from({ length: 31 }, (_, i) => String(i + 1));

  const save = (p: Plan) => { store.savePlan(p); editing = null; creating = false; };

  // ---- routines ----
  let editingRt = $state<Routine | null>(null);
  let creatingRt = $state(false);
  let rtQuery = $state('');
  const routines = $derived(store.routines.filter((r) => r.name.toLowerCase().includes(rtQuery.toLowerCase())));
  const saveRt = (r: Routine) => { store.saveRoutine(r); editingRt = null; creatingRt = false; };
  const removeRt = (id: string) => { if (store.deleteRoutine(id)) editingRt = null; };
  // Every muscle the routine works: primary if any exercise targets it directly, else secondary.
  function routineMuscles(r: Routine): Muscles {
    const primary = new Set<string>(), secondary = new Set<string>();
    for (const re of r.exercises) {
      const m = store.exercise(re.exerciseId)?.muscles;
      m?.primary.forEach((id) => primary.add(id));
      m?.secondary.forEach((id) => secondary.add(id));
    }
    return { primary: [...primary], secondary: [...secondary].filter((id) => !primary.has(id)) };
  }
</script>

<TopBar title={section === 'plans' ? 'Plans' : 'Routines'}
  subtitle={section === 'plans' ? `${subscribed.length} ACTIVE · ${store.plans.length} TOTAL` : `${store.routines.length} ROUTINES`}>
  {#snippet right()}
    <IconButton icon="plus" label={section === 'plans' ? 'New plan' : 'New routine'}
      onclick={() => (section === 'plans' ? (creating = true) : (creatingRt = true))} />
  {/snippet}
</TopBar>

<div class="seg-tabs" role="tablist" aria-label="Section">
  <button role="tab" aria-selected={section === 'plans'} class:on={section === 'plans'} onclick={() => (section = 'plans')}>Plans <span>{store.plans.length}</span></button>
  <button role="tab" aria-selected={section === 'routines'} class:on={section === 'routines'} onclick={() => (section = 'routines')}>Routines <span>{store.routines.length}</span></button>
</div>

{#if section === 'plans'}
<div class="subtabs">
  <div class="pill">
    <button class:on={tab === 'subscribed'} onclick={() => (tab = 'subscribed')}>Subscribed · {subscribed.length}</button>
    <button class:on={tab === 'all'} onclick={() => (tab = 'all')}>Not subscribed · {others.length}</button>
  </div>
</div>

<div class="list r-grid">
  {#each list as p (p.id)}
    {@const keys = p.kind === 'weekly' ? [...WEEK_MON] : MONTH}
    {@const filled = keys.filter((d) => routinesOn(p, d).length).length}
    <div class="plan" style:border-color={p.subscribed ? 'var(--border-hi)' : 'var(--border)'}>
      <div style="padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div class="chip-kind">{p.kind}</div>
          {#if p.subscribed}<div class="dot"></div>{/if}
        </div>
        <div class="cond" style="font-size:18px">{p.name}</div>
        <Label size={9} color="var(--text-low)">
          {filled}/{keys.length} {p.kind === 'weekly' ? 'days' : 'dates'} programmed{p.startedAt && p.subscribed ? ` · started ${new Date(p.startedAt).toLocaleDateString()}` : ''}
        </Label>
      </div>

      {#if p.kind === 'weekly'}
        <div class="week">
          {#each WEEK_MON as d, i (d)}
            {@const n = routinesOn(p, d).length}
            <div class:filled={n > 0} title={n > 1 ? `${n} routines` : undefined}>{'MTWTFSS'[i]}{#if n > 1}<sup>{n}</sup>{/if}</div>
          {/each}
        </div>
      {:else}
        <div class="month">
          {#each MONTH.slice(0, 30) as d (d)}<div class:filled={routinesOn(p, d).length > 0}></div>{/each}
        </div>
      {/if}

      <div class="actions">
        {#if p.subscribed}
          <Button variant="secondary" size="sm" onclick={() => store.setSubscribed(p.id, false)}>Unsubscribe</Button>
        {:else}
          <Button size="sm" icon="check" onclick={() => store.setSubscribed(p.id, true)}>Subscribe</Button>
        {/if}
        <div style="flex:1"></div>
        <button class="mini-btn" onclick={() => (editing = p)}><Icon name="edit" size={12} /> Edit</button>
        <button class="mini-btn" style="color:var(--danger)" onclick={() => (deleting = p)} aria-label="Delete {p.name}"><Icon name="trash" size={14} /></button>
      </div>
    </div>
  {/each}
  {#if !list.length}
    <div class="empty"><Label color="var(--text-low)">{tab === 'subscribed' ? 'No active plans' : 'Library is empty'}</Label></div>
  {/if}
</div>

{:else}
<div style="padding:12px 12px 0">
  <label class="search">
    <Icon name="search" size={14} />
    <input bind:value={rtQuery} placeholder="Search routines…" aria-label="Search routines" />
  </label>
</div>
<div class="list r-grid">
  {#each routines as r (r.id)}
    {@const usedBy = store.plansUsingRoutine(r.id)}
    {@const sets = r.exercises.reduce((n, e) => n + e.goals.length, 0)}
    <button class="rt card" onclick={() => (editingRt = r)}>
      <MuscleThumb muscles={routineMuscles(r)} size={64} />
      <div style="flex:1;min-width:0">
        <div class="cond" style="font-size:18px">{r.name}</div>
        <Label size={9} color="var(--text-low)">{r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} · {sets} sets</Label>
        <div class="used">
          {#each usedBy as p (p.id)}<span class="chip-kind">{p.name}</span>
          {:else}<span class="free">Not in any plan</span>{/each}
        </div>
      </div>
      <Icon name="chev-r" size={16} />
    </button>
  {:else}
    <div class="empty"><Label color="var(--text-low)">{rtQuery ? 'No routines match' : 'No routines yet'}</Label></div>
  {/each}
  <button class="dashed-btn" style="margin-top:4px" onclick={() => (creatingRt = true)}><Icon name="plus" size={14} /> New routine</button>
</div>
{/if}

<Sheet open={!!editingRt} onclose={() => (editingRt = null)} title="Edit · {editingRt?.name}" height="94vh">
  {#if editingRt}{#key editingRt.id}<RoutineEditor routine={editingRt} onsave={saveRt} oncancel={() => (editingRt = null)} ondelete={removeRt} />{/key}{/if}
</Sheet>
<Sheet open={creatingRt} onclose={() => (creatingRt = false)} title="New routine" height="94vh">
  {#if creatingRt}<RoutineEditor onsave={saveRt} oncancel={() => (creatingRt = false)} />{/if}
</Sheet>
<Sheet open={creating} onclose={() => (creating = false)} title="New plan" height="92vh">
  <PlanEditor onsave={save} oncancel={() => (creating = false)} />
</Sheet>
<Sheet open={!!editing} onclose={() => (editing = null)} title="Edit · {editing?.name}" height="92vh">
  {#if editing}{#key editing.id}<PlanEditor plan={editing} onsave={save} oncancel={() => (editing = null)} />{/key}{/if}
</Sheet>
<Sheet open={!!deleting} onclose={() => (deleting = null)} title="Delete plan?">
  {#if deleting}
    <div class="confirm">
      <div class="body-copy"><strong>{deleting.name}</strong> will be permanently removed. Logged sessions stay in history.</div>
      <div class="row">
        <Button variant="secondary" full onclick={() => (deleting = null)}>Cancel</Button>
        <Button variant="danger" full icon="trash" onclick={() => { store.deletePlan(deleting!.id); deleting = null; }}>Delete</Button>
      </div>
    </div>
  {/if}
</Sheet>

<style>
  .subtabs { padding: 12px 12px 0; }
  .pill { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .pill button { padding: 8px 12px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; }
  .pill button.on { background: var(--text); color: var(--bg); }
  .search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; color: var(--text); }
  .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--f-sans); font-size: 13px; }
  .rt { width: 100%; padding: 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left; color: var(--text); }
  .used { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
  .free { font-family: var(--f-mono); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--text-low); }
  .list { padding: 12px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
  .plan { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .dot { width: 6px; height: 6px; border-radius: 3px; background: var(--text); }
  .week { padding: 0 14px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .week div { height: 28px; border-radius: 4px; background: var(--surface-hi); color: var(--text-low); display: flex; align-items: center;
    justify-content: center; font-family: var(--f-cond); font-weight: 600; font-size: 12px; }
  .week div.filled { background: var(--text); color: var(--bg); }
  .week sup { font-size: 9px; margin-left: 1px; }
  .month { padding: 0 14px; display: grid; grid-template-columns: repeat(15, 1fr); gap: 2px; }
  .month div { height: 14px; border-radius: 2px; background: var(--surface-hi); }
  .month div.filled { background: var(--text); }
  .actions { padding: 12px; display: flex; gap: 8px; margin-top: 4px; align-items: center; }
  .empty { padding: 32px; text-align: center; }
  .confirm { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
</style>
