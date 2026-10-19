<script lang="ts">
  // Compact, read-only front-body thumbnail of recent training load (weight × reps, primary full /
  // secondary half), coloured like the heat map. Trimmed to the torso so it fits in the TopBar.
  import BodyFigure from './BodyFigure.svelte';
  import { SHAPES, childrenOf } from '../muscles';
  import { heatColor } from '../heat';
  import { addDays, ymd } from '../dates';
  import { store } from '../store.svelte';
  import { latestBodyKg, isBodyweight } from '../units';

  let { days = 14, width = 42 }: { days?: number; width?: number } = $props();

  const score = $derived.by(() => {
    const from = ymd(addDays(store.today, -(days - 1)));
    const to = store.todayStr;
    const s: Record<string, number> = {};
    const bodyKg = latestBodyKg() ?? 0;
    const credit = (id: string, w: number) => {
      const hs = childrenOf(id);
      (hs.length ? hs : [id]).forEach((h) => (s[h] = (s[h] || 0) + w));
    };
    for (const sess of store.sessions) {
      if (sess.date < from || sess.date > to) continue;
      for (const l of sess.logs) {
        if (!l.actual) continue;
        const ex = store.exercise(l.exerciseId);
        if (!ex?.muscles) continue;
        // Bodyweight sets logged as 0 move the lifter's own weight (latest weigh-in), as on the heat map.
        const kg = l.actual.weight || (isBodyweight(ex.equipment) ? bodyKg : 0);
        const vol = kg * l.actual.reps;
        if (!vol) continue;
        ex.muscles.primary.forEach((id) => credit(id, vol));
        ex.muscles.secondary.forEach((id) => credit(id, vol * 0.5));
      }
    }
    return s;
  });

  const max = $derived(Math.max(1, ...Object.values(score)));
  const fill = (id: string) => (score[id] ? heatColor(0.12 + (0.88 * score[id]) / max) : 'var(--surface-hihi)');
</script>

<div class="mini" style:width="{width}px" role="img" aria-label="Recent muscle load, last {days} days">
  <BodyFigure shapes={SHAPES.advanced.front} {fill} maxWidth={width} />
</div>

<style>
  /* The full figure is tall; clip the lower body so the header keeps a compact, torso-only badge.
     pointer-events off keeps it a pure read-only glance (no hover highlight). */
  .mini { height: 52px; overflow: hidden; display: flex; pointer-events: none; }
  .mini :global(.fig) { gap: 0; }
</style>
