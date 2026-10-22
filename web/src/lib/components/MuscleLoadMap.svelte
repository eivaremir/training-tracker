<script lang="ts">
  // Inline muscle heat map from a precomputed load score (shape-id → kg). Shows front/back figures cropped to
  // only the worked muscles (so a legs block shows legs, not the whole body) plus a per-group breakdown.
  import Label from './Label.svelte';
  import { SHAPES, SILHOUETTE, MUSCLES, groupOf, type Shape } from '../muscles';
  import { heatColor } from '../heat';
  import { toUnit, unit } from '../units';
  import { fmtVol } from '../volume';
  import type { MuscleScore } from '../muscleLoad';

  let { score, title, caption, empty = 'Nothing yet' }:
    { score: MuscleScore; title: string; caption?: string; empty?: string } = $props();

  const max = $derived(Math.max(1, ...Object.values(score)));
  const panels = $derived(
    (['front', 'back'] as const)
      .map((view) => ({ view, worked: SHAPES.advanced[view].filter((sh) => (score[sh.id] ?? 0) > 0) }))
      .filter((p) => p.worked.length)
  );
  const fill = (id: string) => heatColor(0.15 + (0.85 * score[id]) / max);

  const groupsList = $derived.by(() => {
    const g: Record<string, number> = {};
    for (const [id, v] of Object.entries(score)) g[groupOf(id)] = (g[groupOf(id)] || 0) + v;
    const total = Object.values(g).reduce((n, v) => n + v, 0) || 1;
    return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, name: MUSCLES[id] ?? id, v, pct: Math.round((v / total) * 100) }));
  });

  let refs = $state<(SVGGElement | null)[]>([]);
  let boxes = $state<string[]>([]);
  const FULL = '30 4 140 366';
  const track = (node: SVGGElement, i: number) => { refs[i] = node; return { destroy() { if (refs[i] === node) refs[i] = null; } }; };
  $effect(() => {
    panels;
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
</script>

<div class="map">
  <div class="head"><Label>{title}</Label>{#if caption}<Label size={9} color="var(--text-low)">{caption}</Label>{/if}</div>
  {#if !panels.length}
    <div class="empty"><Label size={9} color="var(--text-low)">{empty}</Label></div>
  {:else}
    <div class="body">
      <div class="figs">
        {#each panels as p, i (p.view)}
          <div class="col">
            <svg viewBox={boxes[i] ?? FULL} width="76" height="118" aria-hidden="true">
              <g fill="var(--surface-hi)" stroke="var(--border)" stroke-width="1" opacity="0.5">
                {#each SILHOUETTE as d}<path {d} />{/each}
                <g transform="translate(200,0) scale(-1,1)">{#each SILHOUETTE.slice(2) as d}<path {d} />{/each}</g>
              </g>
              <g use:track={i}>
                {#each p.worked as s (s.id)}<path d={s.d} fill={fill(s.id)} stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round" />{/each}
                <g transform="translate(200,0) scale(-1,1)">
                  {#each p.worked as s (s.id)}<path d={s.d} fill={fill(s.id)} stroke="var(--bg)" stroke-width="1.2" stroke-linejoin="round" />{/each}
                </g>
              </g>
            </svg>
            <Label size={8} color="var(--text-low)">{p.view}</Label>
          </div>
        {/each}
      </div>
      <div class="list">
        {#each groupsList.slice(0, 6) as g (g.id)}
          <div class="row"><i style:background={heatColor(0.15 + (0.85 * g.v) / max)}></i>
            <span class="name">{g.name}</span>
            <span class="num">{fmtVol(toUnit(g.v, 0))} {unit()}</span>
            <span class="pct">{g.pct}%</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .map { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .empty { padding: 6px 0; }
  .body { display: flex; flex-direction: column; gap: 12px; }
  .figs { display: flex; gap: 16px; justify-content: center; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 4px; text-transform: uppercase; }
  svg { display: block; }
  .list { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .row { background: var(--surface); padding: 6px 10px; display: flex; align-items: center; gap: 8px; }
  .row i { width: 8px; height: 8px; border-radius: 4px; flex-shrink: 0; }
  .name { flex: 1; min-width: 0; font-family: var(--f-sans); font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .num { font-family: var(--f-mono); font-size: 11px; color: var(--text-mid); }
  .pct { font-family: var(--f-mono); font-size: 10px; color: var(--text-low); width: 30px; text-align: right; }
</style>
