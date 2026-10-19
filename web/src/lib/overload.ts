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
import { store } from './store.svelte';
import { fmtWeight, isBodyweight, latestBodyKg, toUnit, unit } from './units';
import { fmtVol, setVolumeKg, tracksVolume } from './volume';
import { parseYmd } from './dates';
import type { SetGoal } from './types';

export type OverloadTip = {
  kind: 'reps' | 'set' | 'covered';
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

/** The exercise's volume per training day before `today`, newest first (days with no load left out). */
function pastDays(exerciseId: string, today: string) {
  const ex = store.exercise(exerciseId), bodyKg = latestBodyKg() ?? 0;
  const byDate = new Map<string, number>();
  for (const s of store.sessions) {
    if (s.date >= today) continue;
    for (const l of s.logs) if (l.exerciseId === exerciseId && l.actual) byDate.set(s.date, (byDate.get(s.date) ?? 0) + setVolumeKg(l, ex, bodyKg));
  }
  return [...byDate].filter(([, kg]) => kg > 0).sort((a, b) => b[0].localeCompare(a[0])).map(([date, kg]) => ({ date, kg }));
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
