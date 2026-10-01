// Weight units. Everything is stored in kg; the chosen unit only affects display and input.
import { store } from './store.svelte';

export type Unit = 'kg' | 'lb';
export const LB_PER_KG = 2.2046226218;

export const unit = (): Unit => (store.settings.unit === 'lb' ? 'lb' : 'kg');

/** kg → number in the display unit, rounded to `digits` decimals. */
export function toUnit(kg: number, digits = 1): number {
  const v = unit() === 'lb' ? kg * LB_PER_KG : kg;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Display-unit number → kg for storage (3 decimals keeps lb values stable on round trips). */
export const toKg = (v: number): number => Math.round((unit() === 'lb' ? v / LB_PER_KG : v) * 1000) / 1000;

/**
 * Converts an edited display value back to kg, keeping the original kg exactly when the user
 * didn't change it (so opening and saving a form never nudges stored weights).
 */
export const keepOrConvert = (originalKg: number, edited: number, digits = 1) =>
  edited === toUnit(originalKg, digits) ? originalKg : toKg(edited);

/** "102.5 kg" / "226 lb" */
export const fmtWeight = (kg: number, digits = 1) => `${toUnit(kg, digits)} ${unit()}`;

/** Step for lift weights (+/- buttons): plates come in 2.5 kg / 5 lb. */
export const liftStep = () => (unit() === 'lb' ? 5 : 2.5);

/** Did an actual set meet its goal? Tolerates unit-rounding (well under one plate). */
export const meetsGoal = (actualKg: number, goalKg: number) => actualKg >= goalKg - 0.05;

/** Most recent weigh-in, in kg (weights are kept sorted by date). */
export const latestBodyKg = (): number | null => store.weights.at(-1)?.kg ?? null;
/** Equipment that carries the load itself. Anything else (none, body only, bench, pull-up bar, bands…) may well be
 *  a bodyweight movement, and the data can't tell reliably, so those get body-weight presets. */
const EXTERNAL_LOAD = new Set(['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'cable', 'machine', 'medicine_ball']);
export const isBodyweight = (equipment?: string[]) =>
  !equipment?.length || equipment.includes('bodyweight') || !equipment.some((e) => EXTERNAL_LOAD.has(e));
