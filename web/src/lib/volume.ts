// Training volume (weight × reps, kg) from logged sets, shared by the volume charts.
import { store } from './store.svelte';
import { latestBodyKg, isBodyweight } from './units';
import { routinesOn } from './plans';
import type { Exercise, SetLog } from './types';

/** Load a set moved: bodyweight sets logged as 0 move the lifter's own weight (latest weigh-in), as on the heat map. */
export const setVolumeKg = (l: SetLog, ex: Exercise | undefined, bodyKg = latestBodyKg() ?? 0) =>
  l.actual ? (l.actual.weight || (isBodyweight(ex?.equipment) ? bodyKg : 0)) * l.actual.reps : 0;

export type DayVolume = { vol: number; sessions: number; sets: number };

/** Volume per training day ("YYYY-MM-DD" → totals), for one exercise or all of them, within [from, to].
 *  Cardio and stretching sets count as training but add no volume. */
export function volumeByDate(from: string, to: string, exerciseId?: string): Map<string, DayVolume> {
  const bodyKg = latestBodyKg() ?? 0;
  const out = new Map<string, DayVolume>();
  for (const s of store.sessions) {
    if (s.date < from || s.date > to) continue;
    let vol = 0, sets = 0;
    for (const l of s.logs) {
      if (!l.actual || (exerciseId && l.exerciseId !== exerciseId)) continue;
      const ex = store.exercise(l.exerciseId);
      if (tracksVolume(ex)) vol += setVolumeKg(l, ex, bodyKg);
      sets++;
    }
    if (!sets) continue;
    const d = out.get(s.date) ?? { vol: 0, sessions: 0, sets: 0 };
    out.set(s.date, { vol: d.vol + vol, sessions: d.sessions + 1, sets: d.sets + sets });
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
