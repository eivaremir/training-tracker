<script lang="ts">
  // Today card: the progressive overload suggestion for one exercise (see lib/overload.ts). Renders nothing without history.
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import { overloadTip } from '../overload';
  import type { SetGoal } from '../types';

  let { exerciseId, goals }: { exerciseId: string; goals: SetGoal[] } = $props();
  const tip = $derived(overloadTip(exerciseId, goals));
</script>

{#if tip}
  <div class="tip" class:momentum={tip.momentum}>
    <div class="meta">
      <span class="tag"><Icon name={tip.kind === 'weight' ? 'dumbbell' : tip.momentum ? 'flame' : 'chart'} size={11} />{tip.kind === 'set' ? 'Extra set' : tip.kind === 'covered' ? 'On track' : tip.kind === 'weight' ? 'Add weight' : 'Overload'}</span>
      <Label size={8} color="var(--text-low)">{tip.lead}</Label>
    </div>
    <div class="action">{tip.action}</div>
    <Label size={8} color="var(--text-low)">{tip.detail}</Label>
  </div>
{/if}

<style>
  .tip { margin-bottom: 8px; padding: 8px 12px; border: 1px solid var(--border-hi); border-radius: 12px; background: var(--surface-hi);
    display: flex; flex-direction: column; gap: 5px; }
  .meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px; background: var(--text); color: var(--bg);
    font-family: var(--f-cond); font-weight: 700; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  .tip:not(.momentum) .tag { background: transparent; color: var(--text); border: 1px solid var(--border-hi); }
  .action { font-family: var(--f-sans); font-size: 13px; line-height: 1.4; color: var(--text); }
</style>
