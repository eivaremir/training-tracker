import type { Plan } from './types';

/** Routine ids scheduled on a plan day ("mon".."sun" or "1".."31"). Plans saved before multi-routine days hold one id. */
export const routinesOn = (p: Pick<Plan, 'days'>, key: string): string[] => {
  const v = p.days[key];
  return !v ? [] : Array.isArray(v) ? v : [v];
};

/** Day key for a date in this plan. */
export const dayKey = (p: Pick<Plan, 'kind'>, d: Date, weekdays: readonly string[]) =>
  p.kind === 'weekly' ? weekdays[d.getDay()] : String(d.getDate());
