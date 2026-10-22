// Muscle load (weight × reps) credited to muscles, keyed by the figure's shape ids (childrenOf-spread),
// for the planned-load and done-load maps. Primary full, secondary half; cardio/stretching add no load.
import { store } from './store.svelte';
import { latestBodyKg, isBodyweight } from './units';
import { tracksVolume, setVolumeKg } from './volume';
import { childrenOf } from './muscles';
import type { Exercise, Muscles, SetGoal, SetLog } from './types';

export type MuscleScore = Record<string, number>;

function credit(s: MuscleScore, muscles: Muscles, vol: number) {
  const add = (id: string, w: number) => {
    const hs = childrenOf(id);
    (hs.length ? hs : [id]).forEach((h) => (s[h] = (s[h] || 0) + w));
  };
  muscles.primary.forEach((id) => add(id, vol));
  muscles.secondary.forEach((id) => add(id, vol * 0.5));
}

const loadable = (ex: Exercise | undefined): ex is Exercise => !!ex?.muscles && tracksVolume(ex);

/** Planned load per shape id from a routine's exercises (goal reps × goal weight). */
export function plannedLoad(exercises: { exerciseId: string; goals: SetGoal[] }[]): MuscleScore {
  const s: MuscleScore = {};
  const bodyKg = latestBodyKg() ?? 0;
  for (const re of exercises) {
    const ex = store.exercise(re.exerciseId);
    if (!loadable(ex)) continue;
    for (const g of re.goals) {
      const kg = g.weight || (isBodyweight(ex.equipment) ? bodyKg : 0);
      const vol = kg * g.reps;
      if (vol) credit(s, ex.muscles, vol);
    }
  }
  return s;
}

/** Done load per shape id from logged sets. */
export function loggedLoad(logs: SetLog[]): MuscleScore {
  const s: MuscleScore = {};
  const bodyKg = latestBodyKg() ?? 0;
  for (const l of logs) {
    if (!l.actual) continue;
    const ex = store.exercise(l.exerciseId);
    if (!loadable(ex)) continue;
    const vol = setVolumeKg(l, ex, bodyKg);
    if (vol) credit(s, ex.muscles, vol);
  }
  return s;
}

/** Total volume (kg) of logged sets, counted as the charts do. */
export const totalVolumeKg = (logs: SetLog[], bodyKg = latestBodyKg() ?? 0) =>
  logs.reduce((n, l) => n + setVolumeKg(l, store.exercise(l.exerciseId), bodyKg), 0);
