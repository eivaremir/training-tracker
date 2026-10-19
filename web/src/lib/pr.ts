// Personal records for a single exercise — which logged sets are all-time bests, and which
// just-logged set beat the previous record. Shared by the Today view's set colouring.
//
// A set's standing is ranked by estimated one-rep max (Epley: weight × (1 + reps/30)); a "new PR"
// also counts a heavier top weight or a bigger single-set volume than anything logged before it.
// Bodyweight-0 sets move the lifter's own weight (latest weigh-in), and cardio/stretching are
// excluded — both via lib/volume.ts, so PRs line up with the volume/heat-map numbers.
import { store } from './store.svelte';
import { tracksVolume, setWeightKg, setVolumeKg } from './volume';
import { latestBodyKg, meetsGoal, isBodyweight } from './units';
import type { SetGoal, SetLog } from './types';

/** Two e1RMs within this many kg count as the same record (one plate's rounding, unit noise). */
const E1RM_TOL = 0.5;
/** A logged set is "under" when its load falls below this fraction of the goal's. */
const UNDER_RATIO = 0.9;

/** Epley estimated one-rep max (kg). 0 when the set moved no load or no reps. */
export const epley1RM = (weightKg: number, reps: number) => (reps > 0 && weightKg > 0 ? weightKg * (1 + reps / 30) : 0);

export interface SetMetrics {
  /** Estimated one-rep max (kg). */
  e1rm: number;
  /** Load moved per rep (kg); bodyweight sets use the latest weigh-in. */
  weight: number;
  /** Single-set volume (kg): weight × reps. */
  volume: number;
}

/** A performed, volume-tracked set's PR metrics, or null (skipped, cardio, or stretching). */
export function setMetrics(l: SetLog | undefined, bodyKg = latestBodyKg() ?? 0): SetMetrics | null {
  if (!l?.actual) return null;
  const ex = store.exercise(l.exerciseId);
  if (!tracksVolume(ex)) return null;
  const weight = setWeightKg(l, ex, bodyKg);
  return { weight, volume: setVolumeKg(l, ex, bodyKg), e1rm: epley1RM(weight, l.actual.reps) };
}

/** Kinds of record a set can set. */
export type PRKind = 'e1rm' | 'weight' | 'volume';

export interface ExercisePR {
  /** Top-3 distinct estimated-1RM values, highest first (empty with no loaded history). */
  readonly tiers: number[];
  /** Medal rank of a set among the exercise's all-time sets by e1RM: 1 | 2 | 3, or null. */
  rank(l: SetLog | undefined): 1 | 2 | 3 | null;
  /** Records this set set the moment it was logged (beating every set logged before it), or null. */
  newPR(l: SetLog | undefined): PRKind[] | null;
}

/** Build the PR index for one exercise from the whole history. Reading store.sessions / weights here
 *  means a caller in a $derived re-runs it whenever a set is logged, so colours stay live. */
export function exercisePR(exerciseId: string, bodyKg = latestBodyKg() ?? 0): ExercisePR {
  const perf: { at: string; m: SetMetrics }[] = [];
  for (const s of store.sessions)
    for (const l of s.logs)
      if (l.exerciseId === exerciseId) {
        const m = setMetrics(l, bodyKg);
        if (m && m.e1rm > 0) perf.push({ at: l.loggedAt, m });
      }

  // Distinct e1RM values, highest first — collapsing near-equal lifts into one record tier.
  const tiers: number[] = [];
  for (const e of perf.map((p) => p.m.e1rm).sort((a, b) => b - a)) {
    if (!tiers.some((t) => Math.abs(t - e) <= E1RM_TOL)) tiers.push(e);
    if (tiers.length === 3) break;
  }

  return {
    tiers,
    rank(l) {
      const m = setMetrics(l, bodyKg);
      if (!m || m.e1rm <= 0) return null;
      const i = tiers.findIndex((t) => Math.abs(t - m.e1rm) <= E1RM_TOL);
      return i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : null;
    },
    newPR(l) {
      const m = setMetrics(l, bodyKg);
      if (!m || m.e1rm <= 0 || !l) return null;
      let bestE = 0, bestW = 0, bestV = 0, prior = 0;
      for (const p of perf) {
        if (p.at >= l.loggedAt) continue; // strictly earlier; excludes the set itself
        prior++;
        bestE = Math.max(bestE, p.m.e1rm);
        bestW = Math.max(bestW, p.m.weight);
        bestV = Math.max(bestV, p.m.volume);
      }
      if (prior === 0) return null; // the first set ever beats no record
      const kinds: PRKind[] = [];
      if (m.e1rm > bestE + E1RM_TOL) kinds.push('e1rm');
      if (m.weight > bestW + 0.05) kinds.push('weight');
      if (m.volume > bestV + 0.05) kinds.push('volume');
      return kinds.length ? kinds : null;
    }
  };
}

/** One-off medal rank (rebuilds the index — in a loop, use `exercisePR` once instead). */
export const prRank = (exerciseId: string, l: SetLog | undefined) => exercisePR(exerciseId).rank(l);
/** One-off "did this set set a new record?" (rebuilds the index — prefer `exercisePR` in a loop). */
export const isSetPR = (exerciseId: string, l: SetLog | undefined) => exercisePR(exerciseId).newPR(l) !== null;

/** True when a logged planned set fell clearly short of its goal (or was skipped). Extras (no goal) never under. */
export function underperforms(l: SetLog | undefined, goal: SetGoal | undefined | null, bodyKg = latestBodyKg() ?? 0): boolean {
  if (!l || !goal) return false;
  if (!l.actual) return true; // a skipped planned set
  if (l.actual.reps >= goal.reps && meetsGoal(l.actual.weight, goal.weight)) return false; // met it
  const ex = store.exercise(l.exerciseId);
  const goalWeight = goal.weight || (isBodyweight(ex?.equipment) ? bodyKg : 0);
  const goalLoad = goalWeight * goal.reps;
  if (goalLoad > 0) return setWeightKg(l, ex, bodyKg) * l.actual.reps < goalLoad * UNDER_RATIO;
  return l.actual.reps < goal.reps * UNDER_RATIO; // reps-only goal we can't weigh
}

/** How a (planned) set turned out, for colouring. `done` = logged but neither a record, a clear
 *  hit, nor a clear miss (a near-miss, or an extra set with no goal). */
export type Outcome = 'pending' | 'pr' | 'hit' | 'under' | 'done';

export function setOutcome(pr: ExercisePR, l: SetLog | undefined, goal: SetGoal | undefined | null, bodyKg = latestBodyKg() ?? 0): Outcome {
  if (!l) return 'pending';
  if (pr.newPR(l)) return 'pr';
  const g = goal ?? l.goalSnapshot ?? null;
  if (l.actual && g && l.actual.reps >= g.reps && meetsGoal(l.actual.weight, g.weight)) return 'hit';
  if (underperforms(l, g, bodyKg)) return 'under';
  return 'done';
}
