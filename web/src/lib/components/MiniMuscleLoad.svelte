<script lang="ts">
  // Header badge of TODAY'S PLANNED workout as a muscle heat map: planned load (goal reps × goal weight,
  // primary full / secondary half) coloured like the heat map, cropped to only the muscles the plan works —
  // a legs day shows legs, not the whole body. Tap it to open a larger view with a worked-muscle breakdown.
  import Sheet from './Sheet.svelte';
  import Label from './Label.svelte';
  import { SHAPES, SILHOUETTE, MUSCLES, childrenOf, groupOf, type Shape } from '../muscles';
  import { heatColor } from '../heat';
  import { store } from '../store.svelte';
  import { latestBodyKg, isBodyweight, toUnit, unit } from '../units';
  import { fmtVol, tracksVolume } from '../volume';
  import type { SetGoal } from '../types';

  let { exercises = [] }: { exercises?: { exerciseId: string; goals: SetGoal[] }[] } = $props();

  // Planned load per muscle-shape id, spreading a muscle-group goal (e.g. "quads") across its child shapes.
  const score = $derived.by(() => {
    const s: Record<string, number> = {};
    const bodyKg = latestBodyKg() ?? 0;
    const credit = (id: string, w: number) => {
      const hs = childrenOf(id);
      (hs.length ? hs : [id]).forEach((h) => (s[h] = (s[h] || 0) + w));
    };
    for (const re of exercises) {
      const ex = store.exercise(re.exerciseId);
      // Weight × reps isn't a meaningful load for cardio/stretching, as on the heat maps.
      if (!ex?.muscles || !tracksVolume(ex)) continue;
      for (const g of re.goals) {
        // Bodyweight goals (weight 0) move the lifter's own weight, as on the heat map.
        const kg = g.weight || (isBodyweight(ex.equipment) ? bodyKg : 0);
        const vol = kg * g.reps;
        if (!vol) continue;
        ex.muscles.primary.forEach((id) => credit(id, vol));
        ex.muscles.secondary.forEach((id) => credit(id, vol * 0.5));
      }
    }
    return s;
  });

  const max = $derived(Math.max(1, ...Object.values(score)));
  // Only the figures (front / back) that have a worked muscle, so the badge trims to what the plan hits.
  const panels = $derived(
    (['front', 'back'] as const)
      .map((view) => ({ view, worked: SHAPES.advanced[view].filter((sh) => score[sh.id] > 0) }))
      .filter((p) => p.worked.length)
  );
  const fill = (id: string) => heatColor(0.15 + (0.85 * score[id]) / max);

  // Worked muscle groups, biggest planned load first — the breakdown in the enlarged view.
  const groupsList = $derived.by(() => {
    const g: Record<string, number> = {};
    for (const [id, v] of Object.entries(score)) g[groupOf(id)] = (g[groupOf(id)] || 0) + v;
    const total = Object.values(g).reduce((n, v) => n + v, 0) || 1;
    return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, name: MUSCLES[id] ?? id, v, pct: Math.round((v / total) * 100) }));
  });

  // Crop each figure's viewBox to its worked muscles (measured from the small badge, reused at both sizes).
  let refs = $state<(SVGGElement | null)[]>([]);
  let boxes = $state<string[]>([]);
  const FULL = '30 4 140 366';
  const track = (node: SVGGElement, i: number) => { refs[i] = node; return { destroy() { if (refs[i] === node) refs[i] = null; } }; };
  $effect(() => {
    panels; // re-measure when the worked set changes
    const next = panels.map((_, i) => {
      try {
        const b = refs[i]?.getBBox();
        if (!b || !b.width) return FULL;
        const pad = 12;
        return `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
      } catch { return FULL; }
    });
    if (next.length !== boxes.length || next.some((v, i) => v !== boxes[i])) boxes = next;
  });

  let open = $state(false);
</script>

{#snippet workedPaths(p: { worked: Shape[] })}
  {#each p.worked as s (s.id)}<path d={s.d} fill={fill(s.id)} stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round" />{/each}
  <g transform="translate(200,0) scale(-1,1)">
    {#each p.worked as s (s.id)}<path d={s.d} fill={fill(s.id)} stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round" />{/each}
  </g>
{/snippet}

{#snippet figure(p: { view: string; worked: Shape[] }, i: number, w: number, h: number, measure: boolean)}
  <svg viewBox={boxes[i] ?? FULL} width={w} height={h} aria-hidden="true">
    <g fill="var(--surface-hi)" stroke="var(--border)" stroke-width="1" opacity="0.5">
      {#each SILHOUETTE as d}<path {d} />{/each}
      <g transform="translate(200,0) scale(-1,1)">{#each SILHOUETTE.slice(2) as d}<path {d} />{/each}</g>
    </g>
    {#if measure}<g use:track={i}>{@render workedPaths(p)}</g>{:else}<g>{@render workedPaths(p)}</g>{/if}
  </svg>
{/snippet}

{#if panels.length}
  <button class="mini" onclick={() => (open = true)} aria-label="Show today's planned muscle load">
    {#each panels as p, i (p.view)}{@render figure(p, i, 28, 46, true)}{/each}
  </button>

  <Sheet {open} onclose={() => (open = false)} title="Today's planned load">
    <div class="big">
      <div class="figs">
        {#each panels as p, i (p.view)}
          <div class="col">{@render figure(p, i, 130, 214, false)}<Label size={9} color="var(--text-low)">{p.view}</Label></div>
        {/each}
      </div>
      <div class="list">
        {#each groupsList as g (g.id)}
          <div class="row"><i style:background={heatColor(0.15 + (0.85 * g.v) / max)}></i>
            <span class="name">{g.name}</span>
            <span class="num">{fmtVol(toUnit(g.v, 0))} {unit()}</span>
            <span class="pct">{g.pct}%</span>
          </div>
        {/each}
      </div>
      <Label size={8} color="var(--text-low)">Planned load = goal reps × goal weight, primary full · secondary half.</Label>
    </div>
  </Sheet>
{/if}

<style>
  .mini { display: flex; align-items: center; gap: 2px; padding: 0; background: none; border: none; cursor: zoom-in; }
  .mini svg { display: block; }
  .big { padding: 14px 16px 20px; display: flex; flex-direction: column; gap: 16px; }
  .figs { display: flex; justify-content: center; gap: 20px; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 6px; text-transform: uppercase; }
  .list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .row { background: var(--surface); padding: 9px 12px; display: flex; align-items: center; gap: 10px; }
  .row i { width: 9px; height: 9px; border-radius: 5px; flex-shrink: 0; }
  .name { flex: 1; min-width: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text); }
  .num { font-family: var(--f-mono); font-size: 12px; color: var(--text-mid); }
  .pct { font-family: var(--f-mono); font-size: 11px; color: var(--text-low); width: 34px; text-align: right; }
</style>
