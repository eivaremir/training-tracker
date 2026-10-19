// Training volume (weight × reps, kg) from logged sets, shared by the volume charts.
import { store } from './store.svelte';
import { latestBodyKg, isBodyweight } from './units';
import { routinesOn } from './plans';
import type { Exercise, SetLog } from './types';

/** Weight a set moved (kg): bodyweight sets logged as 0 move the lifter's own weight (latest weigh-in), as on the heat map. */
export const setWeightKg = (l: SetLog, ex: Exercise | undefined, bodyKg = latestBodyKg() ?? 0) =>
  l.actual ? l.actual.weight || (isBodyweight(ex?.equipment) ? bodyKg : 0) : 0;

/** Load a set moved: weight × reps. */
export const setVolumeKg = (l: SetLog, ex: Exercise | undefined, bodyKg = latestBodyKg() ?? 0) =>
  l.actual ? setWeightKg(l, ex, bodyKg) * l.actual.reps : 0;

/** Reps a set performed (0 when skipped). */
export const setRepsOf = (l: SetLog) => l.actual?.reps ?? 0;

/** `vol` = Σ weight × reps, `weight` = Σ per-set weight (both exclude cardio/stretching); `reps` counts every set. */
export type DayVolume = { vol: number; weight: number; reps: number; sessions: number; sets: number };

/** Metric the heat maps can show. Volume and weight are in kg (convert with toUnit); reps is a plain count. */
export type HeatMetric = 'volume' | 'weight' | 'reps';
export const HEAT_METRICS: { key: HeatMetric; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'weight', label: 'Weight' },
  { key: 'reps', label: 'Reps' }
];
/** The day's total for the chosen metric. */
export const dayMetric = (d: DayVolume, m: HeatMetric) => (m === 'reps' ? d.reps : m === 'weight' ? d.weight : d.vol);

/** Totals per training day ("YYYY-MM-DD" → totals), for one exercise or all of them, within [from, to].
 *  Cardio and stretching sets count as training and keep their reps, but add no volume or weight. */
export function volumeByDate(from: string, to: string, exerciseId?: string): Map<string, DayVolume> {
  const bodyKg = latestBodyKg() ?? 0;
  const out = new Map<string, DayVolume>();
  for (const s of store.sessions) {
    if (s.date < from || s.date > to) continue;
    let vol = 0, weight = 0, reps = 0, sets = 0;
    for (const l of s.logs) {
      if (!l.actual || (exerciseId && l.exerciseId !== exerciseId)) continue;
      const ex = store.exercise(l.exerciseId);
      reps += setRepsOf(l);
      if (tracksVolume(ex)) { vol += setVolumeKg(l, ex, bodyKg); weight += setWeightKg(l, ex, bodyKg); }
      sets++;
    }
    if (!sets) continue;
    const d = out.get(s.date) ?? { vol: 0, weight: 0, reps: 0, sessions: 0, sets: 0 };
    out.set(s.date, { vol: d.vol + vol, weight: d.weight + weight, reps: d.reps + reps, sessions: d.sessions + 1, sets: d.sets + sets });
  }
  return out;
}

/** Catalog categories where weight × reps isn't a meaningful load (a run or a stretch logged as 1 × 0). */
const NO_VOLUME = new Set(['cardio', 'stretching']);
export const tracksVolume = (ex: Exercise | undefined) => !NO_VOLUME.has(ex?.category ?? '');

/** Exercise ids scheduled in the subscribed plans' routines, in first-seen order; `lifts` keeps only volume-tracked ones. */
export function planExerciseIds(lifts = false): string[] {
  const ids = new Set<string>();
  for (const p of store.plans.filter((x) => x.subscribed))
    for (const key of Object.keys(p.days))
      for (const rid of routinesOn(p, key))
        store.routine(rid)?.exercises.forEach((e) => ids.add(e.exerciseId));
  return [...ids].filter((id) => !lifts || tracksVolume(store.exercise(id)));
}

// Compact numbers for axes and tiles: 950, 1.98k, 12.4k.
export const fmtVol = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : String(Math.round(v)));
