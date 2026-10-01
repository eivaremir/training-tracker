<script lang="ts">
  // Muscle picker. Tap: primary → secondary → off. Simple = groups, advanced = individual heads.
  import Label from './Label.svelte';
  import BodyFigure from './BodyFigure.svelte';
  import { MUSCLES, PARENT, SHAPES, childrenOf, stateOf, type BodyMode } from '../muscles';
  import type { Muscles } from '../types';

  let { value = $bindable({ primary: [], secondary: [] }) }: { value?: Muscles } = $props();

  let hover = $state<string | null>(null);
  let mode = $state<BodyMode>(read());
  function read(): BodyMode { try { return (localStorage.getItem('tt-bodymap') as BodyMode) || 'advanced'; } catch { return 'advanced'; } }
  function setMode(m: BodyMode) { mode = m; try { localStorage.setItem('tt-bodymap', m); } catch { /* ignore */ } }

  const next = (st: string, id: string, P: string[], S: string[]): Muscles =>
    st === 'n' ? { primary: [...P, id], secondary: S } : st === 'p' ? { primary: P, secondary: [...S, id] } : { primary: P, secondary: S };

  function tap(id: string) {
    let P = [...value.primary], S = [...value.secondary];
    if (mode === 'advanced') {
      const par = PARENT[id];
      // Expanding a whole-group selection into its heads before toggling one head.
      if (par && P.includes(par)) P = [...P.filter((x) => x !== par), ...childrenOf(par)];
      if (par && S.includes(par)) S = [...S.filter((x) => x !== par), ...childrenOf(par)];
      const st = P.includes(id) ? 'p' : S.includes(id) ? 's' : 'n';
      value = next(st, id, P.filter((x) => x !== id), S.filter((x) => x !== id));
    } else {
      const st = stateOf(id, value, 'simple');
      const drop = [id, ...childrenOf(id)];
      value = next(st, id, P.filter((x) => !drop.includes(x)), S.filter((x) => !drop.includes(x)));
    }
  }
  function chipTap(id: string) {
    const P = value.primary.filter((x) => x !== id), S = value.secondary.filter((x) => x !== id);
    value = value.primary.includes(id) ? { primary: P, secondary: [...S, id] } : { primary: P, secondary: S };
  }
  const fill = (id: string) => {
    const s = stateOf(id, value, mode);
    return s === 'p' ? 'var(--text)' : s === 's' ? 'var(--mid)' : hover === id ? 'var(--border-hi)' : 'var(--surface-hihi)';
  };
</script>

<div class="wrap">
  <div class="head">
    <Label>Muscles worked</Label>
    <div class="seg">
      {#each ['simple', 'advanced'] as const as m}
        <button class:on={mode === m} onclick={() => setMode(m)}>{m}</button>
      {/each}
    </div>
  </div>
  <div class="stage">
    <div class="hint"><Label size={9} color={hover ? 'var(--text)' : 'var(--text-low)'}>{hover ? MUSCLES[hover] : 'Tap: primary → secondary → off'}</Label></div>
    <BodyFigure shapes={SHAPES[mode].front} label="Front" {fill} ontap={tap} bind:hover />
    <BodyFigure shapes={SHAPES[mode].back} label="Back" {fill} ontap={tap} bind:hover />
  </div>
  <div class="legend">
    <div><i style:background="var(--text)"></i><Label size={9} color="var(--text-low)">Primary</Label></div>
    <div><i style:background="var(--mid)"></i><Label size={9} color="var(--text-low)">Secondary</Label></div>
  </div>
  {#if value.primary.length || value.secondary.length}
    <div class="chips">
      {#each value.primary as id (id)}<button class="chip p" onclick={() => chipTap(id)}>{MUSCLES[id]}</button>{/each}
      {#each value.secondary as id (id)}<button class="chip" onclick={() => chipTap(id)}>{MUSCLES[id]}</button>{/each}
    </div>
  {/if}
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .seg { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button { padding: 5px 10px; border: none; cursor: pointer; background: transparent; color: var(--text-mid);
    font-family: var(--f-cond); font-weight: 600; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; }
  .seg button.on { background: var(--text); color: var(--bg); }
  .stage { position: relative; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 26px 8px 10px; display: flex; gap: 4px; }
  .hint { position: absolute; top: 8px; left: 0; right: 0; text-align: center; }
  .legend { display: flex; gap: 14px; }
  .legend div { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 10px; height: 10px; border-radius: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { padding: 4px 8px; border-radius: 4px; cursor: pointer; background: transparent; color: var(--text); border: 1px solid var(--border-hi);
    font-family: var(--f-cond); font-weight: 600; font-size: 13px; letter-spacing: 0.8px; text-transform: uppercase; }
  .chip.p { background: var(--text); color: var(--bg); border-color: var(--text); }
</style>
