// Progressive overload tip for an exercise on the Today screen: how to beat its last session's volume (weight × reps).
//
// Target = last session's actual volume × (1 + step). The step comes from momentum:
// - Volume held or rose across the last 2 sessions → keep the trend going, clamped to +2%…+10%.
// - Otherwise (and on a first repeat) → a gentle +1%.
// The suggestion is the smallest real bump that reaches the target on top of today's planned goals: +1 rep on the
// heaviest sets, or — when that would need more than a rep per set — one extra set at the heaviest set's load.
// Every printed number (the "% vs last" and the last → target volumes) is derived from the volume that suggestion
// actually produces, so they always reconcile even when the last session's sets differ from today's goals.
// The last session is last week's on a weekly plan. Volume is counted as on the charts (lib/volume.ts).
//
// Exception — double progression: for a loaded lift whose last session's working sets were already high-rep
// (averaging HIGH_REPS+), piling on more reps is the wrong move; the tip instead says to add one plate and reset
// toward the plan's rep goal. That path is about intensity (load per rep), not total volume, so it shows a concrete
// reps×weight before→after rather than a volume "% vs last".
import { store } from './store.svelte';
import { fmtWeight, isBodyweight, latestBodyKg, liftStep, toUnit, unit } from './units';
import { fmtVol, setVolumeKg, setWeightKg, tracksVolume } from './volume';
import { parseYmd } from './dates';
import type { SetGoal } from './types';

export type OverloadTip = {
  kind: 'reps' | 'set' | 'covered' | 'weight';
  momentum: boolean;
  /** Why: the recent trend. */
  lead: string;
  /** What to do today. */
  action: string;
  /** Last session's volume → today's target. */
  detail: string;
};

const DEFAULT_LO = 0.01, DEFAULT_HI = 0.02, MAX_STEP = 0.1;

const fmtDate = (ds: string) => parseYmd(ds).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const vol = (kg: number) => `${fmtVol(toUnit(kg, 0))} ${unit()}`;
const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const abs = (x: number) => `${Math.abs(Math.round(x * 100))}%`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** The exercise's volume and per-set loads per training day before `today`, newest first (days with no load left out). */
function pastDays(exerciseId: string, today: string) {
  const ex = store.exercise(exerciseId), bodyKg = latestBodyKg() ?? 0;
  const byDate = new Map<string, { kg: number; sets: { reps: number; kg: number }[] }>();
  for (const s of store.sessions) {
    if (s.date >= today) continue;
    for (const l of s.logs) {
      if (l.exerciseId !== exerciseId || !l.actual) continue;
      const d = byDate.get(s.date) ?? { kg: 0, sets: [] };
      d.kg += setVolumeKg(l, ex, bodyKg);
      d.sets.push({ reps: l.actual.reps, kg: setWeightKg(l, ex, bodyKg) });
      byDate.set(s.date, d);
    }
  }
  return [...byDate].filter(([, d]) => d.kg > 0).sort((a, b) => b[0].localeCompare(a[0])).map(([date, d]) => ({ date, ...d }));
}

export function overloadTip(exerciseId: string, goals: SetGoal[], today = store.todayStr): OverloadTip | null {
  const ex = store.exercise(exerciseId);
  if (!goals.length || !tracksVolume(ex)) return null;
  const [last, before] = pastDays(exerciseId, today);
  if (!last) return null;

  const bw = isBodyweight(ex?.equipment), bodyKg = latestBodyKg() ?? 0;
  const kgOf = (g: SetGoal) => g.weight || (bw ? bodyKg : 0);
  const weights = goals.map(kgOf);
  const maxW = Math.max(...weights);
  if (!maxW) return null; // nothing to grow by volume (e.g. a bodyweight move with no weigh-in yet)
  const planned = goals.reduce((n, g, i) => n + g.reps * weights[i], 0);

  const momentum = !!before && last.kg >= before.kg;
  const trend = before ? last.kg / before.kg - 1 : 0;

  // Double progression: when last session's loaded sets already averaged a high rep count, the obvious next step is
  // heavier weight, not yet more reps. Only for loaded lifts — a bodyweight move (no external plate to add) keeps the
  // reps/extra-set advice below. HIGH_REPS = 15 catches a hypertrophy/endurance plateau; 20+ is well past any range.
  const HIGH_REPS = 15;
  const workSets = last.sets.filter((s) => s.kg > 0); // the loaded working sets
  const avgReps = workSets.length ? workSets.reduce((n, s) => n + s.reps, 0) / workSets.length : 0;
  if (!bw && workSets.length && avgReps >= HIGH_REPS) {
    const lastRepsNum = Math.round(avgReps);
    const repsVary = workSets.some((s) => s.reps !== workSets[0].reps);
    const lastReps = `${repsVary ? '~' : ''}${lastRepsNum}`;
    // Add one plate to the heaviest load actually proven (last session's top set, never below today's planned top).
    const topW = Math.max(...workSets.map((s) => s.kg));
    const wUnit = (d: number) => `${+d.toFixed(1)} ${unit()}`;
    const lastW = wUnit(toUnit(topW, 1));
    const newW = wUnit(toUnit(Math.max(topW, maxW), 1) + liftStep());
    // Reset toward the plan's own rep goal (the low end of the range they've outgrown); if that isn't actually fewer
    // reps than they just did, keep the rep count and warn it may dip under the heavier load.
    const goalReps = goals.reduce((a, b) => (kgOf(b) > kgOf(a) ? b : a)).reps;
    const dip = goalReps >= lastRepsNum;
    const newReps = dip ? lastRepsNum : goalReps;
    const stepTxt = `${liftStep()} ${unit()}`;
    const action = dip
      ? `Add ${stepTxt}: keep ~${newReps} reps at ${newW} (they may dip).`
      : `Add ${stepTxt}: aim ~${newReps}×${newW}.`;
    return {
      kind: 'weight',
      momentum,
      lead: `${lastReps} reps a set last time — ready to go heavier`,
      action,
      detail: `${fmtDate(last.date)}: ${lastReps}×${lastW} → ~${newReps}×${newW}`
    };
  }

  const step = momentum ? Math.min(MAX_STEP, Math.max(DEFAULT_HI, trend)) : DEFAULT_LO;
  const target = last.kg * (1 + step);

  const vs = `vs ${fmtDate(last.date)}`;
  const lead = !before ? `First repeat · last time ${vol(last.kg)}`
    : momentum ? (trend > 0.0005 ? `Volume up ${abs(trend)} over your last 2 sessions` : 'Volume held steady over your last 2 sessions')
    : `Volume down ${abs(trend)} last session`;
  // The whole tip in one line: last session's volume → the volume the suggestion below reaches.
  const detailTo = (result: number) => `${fmtDate(last.date)}: ${vol(last.kg)} → ${vol(result)}`;

  // Today's planned goals already match or beat the target: just hold the line.
  if (planned >= target - 1e-9) {
    const by = Math.round((planned / last.kg - 1) * 100);
    return { kind: 'covered', momentum, lead, action: `Today's goals already beat ${fmtDate(last.date)} by ${by}%. Hit every set.`, detail: detailTo(planned) };
  }

  const gap = target - planned;
  // Fewest extra reps that reach the target: +1 rep on the heaviest sets first, one rep per set at most.
  const desc = [...weights].sort((a, b) => b - a);
  let k = 0, added = 0;
  while (k < goals.length && added < gap - 1e-9) added += desc[k++];
  if (added >= gap - 1e-9) {
    const result = planned + added;
    const uniform = weights.every((w) => w === weights[0]);
    const where = k === goals.length ? 'every set' : uniform ? `${k} set${k === 1 ? '' : 's'}` : `your heaviest ${k} sets`;
    return { kind: 'reps', momentum, lead, action: `Add 1 rep on ${where} to reach ${pct(result / last.kg - 1)} ${vs}.`, detail: detailTo(result) };
  }

  // More than a rep per set needed: one extra set at the heaviest set's load, capped to a normal set.
  const g = goals.reduce((a, b) => (kgOf(b) > kgOf(a) ? b : a));
  const w = kgOf(g);
  const reps = Math.min(Math.ceil(gap / w - 1e-9), g.reps);
  const result = planned + reps * w;
  const load = g.weight ? ` × ${fmtWeight(g.weight)}` : ' reps';
  const setTxt = `Add a ${ordinal(goals.length + 1)} set: ${reps}${load}`;
  const gain = result / last.kg - 1;
  // A capped extra set may still fall short when today's goals are much lighter than last time — say so honestly.
  const action = gain > 0.0005 ? `${setTxt} to reach ${pct(gain)} ${vs}.` : `${setTxt} to close on ${fmtDate(last.date)}'s ${vol(last.kg)}.`;
  return { kind: 'set', momentum, lead, action, detail: detailTo(result) };
}
