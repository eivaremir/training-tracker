// Progressive overload tip for an exercise on the Today screen: how to beat its last session's volume (weight × reps).
//
// - Momentum (volume held or rose across the last 2 sessions): keep the trend going, at least +2% and at most +10%,
//   as +1 rep on some sets, or as one extra set when that would take more than a rep per set.
// - Otherwise, the default: +1–2% over the last session as extra reps beyond today's goals.
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
  // Average load per rep across today's sets, to turn a volume gap into reps.
  const repKg = goals.reduce((n, g) => n + kgOf(g), 0) / goals.length;
  if (!repKg) return null;
  const planned = goals.reduce((n, g) => n + g.reps * kgOf(g), 0);

  const momentum = !!before && last.kg >= before.kg;
  const trend = before ? last.kg / before.kg - 1 : 0;
  const lo = momentum ? Math.min(MAX_STEP, Math.max(DEFAULT_HI, trend)) : DEFAULT_LO;
  const hi = momentum ? lo : DEFAULT_HI;
  // Extra reps beyond today's goals to reach last session × (1 + p).
  const need = (p: number) => Math.max(0, Math.ceil((last.kg * (1 + p) - planned) / repKg - 1e-9));
  const nLo = need(lo), nHi = need(hi);
  const target = momentum ? pct(lo) : '+1–2%';
  const vs = `vs ${fmtDate(last.date)}`;
  const lead = !before ? `First repeat · last time ${vol(last.kg)}`
    : momentum ? (trend > 0.0005 ? `Volume up ${abs(trend)} over your last 2 sessions` : 'Volume held steady over your last 2 sessions')
    : `Volume down ${abs(trend)} last session`;
  const goal = momentum ? vol(last.kg * (1 + lo)) : `${fmtVol(toUnit(last.kg * (1 + lo), 0))}–${vol(last.kg * (1 + hi))}`;
  const detail = `${fmtDate(last.date)}: ${vol(last.kg)} · target ${goal}`;

  if (!nHi) return { kind: 'covered', momentum, lead, action: `Today's goals are already ${pct(planned / last.kg - 1)} ${vs}. Hit every set.`, detail };

  if (momentum) {
    if (nHi <= goals.length) {
      const where = nHi === goals.length ? 'every set' : `${nHi} set${nHi === 1 ? '' : 's'}`;
      return { kind: 'reps', momentum, lead, action: `Add 1 rep on ${where} (${target} ${vs}).`, detail };
    }
    // More than a rep per set: one extra set at the last set's load instead.
    const g = goals[goals.length - 1], reps = Math.min(nHi, g.reps);
    const load = g.weight ? ` × ${fmtWeight(g.weight)}` : ' reps';
    return { kind: 'set', momentum, lead, action: `Add a ${ordinal(goals.length + 1)} set: ${reps}${load} (${target} ${vs}).`, detail };
  }
  const reps = nLo === nHi ? `${nHi} rep${nHi === 1 ? '' : 's'}` : nLo ? `${nLo}–${nHi} reps` : `up to ${nHi} reps`;
  return { kind: 'reps', momentum, lead, action: `Aim for ${target} ${vs}: add ${reps} beyond your goals.`, detail };
}
