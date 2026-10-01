<script lang="ts">
  // Plans — list, create, edit, delete, subscribe/unsubscribe.
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Button from '$lib/components/Button.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import PlanEditor from '$lib/components/PlanEditor.svelte';
  import { store } from '$lib/store.svelte';
  import { WEEK_MON } from '$lib/dates';
  import type { Plan } from '$lib/types';

  let tab = $state<'subscribed' | 'all'>('subscribed');
  let editing = $state<Plan | null>(null);
  let creating = $state(false);
  let deleting = $state<Plan | null>(null);

  const subscribed = $derived(store.plans.filter((p) => p.subscribed));
  const others = $derived(store.plans.filter((p) => !p.subscribed));
  const list = $derived(tab === 'subscribed' ? subscribed : others);
  const MONTH = Array.from({ length: 31 }, (_, i) => String(i + 1));

  const save = (p: Plan) => { store.savePlan(p); editing = null; creating = false; };
</script>

<TopBar title="Plans" subtitle="{subscribed.length} ACTIVE · {store.plans.length} TOTAL">
  {#snippet right()}<IconButton icon="plus" onclick={() => (creating = true)} label="New plan" />{/snippet}
</TopBar>

<div class="seg-tabs">
  <button class:on={tab === 'subscribed'} onclick={() => (tab = 'subscribed')}>Subscribed <span>{subscribed.length}</span></button>
  <button class:on={tab === 'all'} onclick={() => (tab = 'all')}>Library <span>{others.length}</span></button>
</div>

<div class="list">
  {#each list as p (p.id)}
    {@const keys = p.kind === 'weekly' ? [...WEEK_MON] : MONTH}
    {@const filled = keys.filter((d) => p.days[d]).length}
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
            <div class:filled={!!p.days[d]}>{'MTWTFSS'[i]}</div>
          {/each}
        </div>
      {:else}
        <div class="month">
          {#each MONTH.slice(0, 30) as d (d)}<div class:filled={!!p.days[d]}></div>{/each}
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
  .list { padding: 12px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
  .plan { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .dot { width: 6px; height: 6px; border-radius: 3px; background: var(--text); }
  .week { padding: 0 14px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .week div { height: 28px; border-radius: 4px; background: var(--surface-hi); color: var(--text-low); display: flex; align-items: center;
    justify-content: center; font-family: var(--f-cond); font-weight: 600; font-size: 11px; }
  .week div.filled { background: var(--text); color: var(--bg); }
  .month { padding: 0 14px; display: grid; grid-template-columns: repeat(15, 1fr); gap: 2px; }
  .month div { height: 14px; border-radius: 2px; background: var(--surface-hi); }
  .month div.filled { background: var(--text); }
  .actions { padding: 12px; display: flex; gap: 8px; margin-top: 4px; align-items: center; }
  .empty { padding: 32px; text-align: center; }
  .confirm { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
</style>
