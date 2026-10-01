import { routinesOn, dayKey } from './plans';
// Demo data used in offline mode (no VITE_API_URL). History is generated relative to today.
import type { AppState, Exercise, Plan, Routine, Session, SetGoal, SetLog, WeightEntry } from './types';
import { WEEKDAYS, addDays, ymd } from './dates';

const goal = (reps: number, weight: number, restSeconds = 90): SetGoal => ({ reps, weight, restSeconds });
const times = (n: number, g: SetGoal) => Array.from({ length: n }, () => ({ ...g }));

const MUSCLE_MAP: Record<string, [string[], string[]]> = {
  ex_bench: [['chest'], ['triceps', 'shoulders']], ex_squat: [['quads', 'glutes'], ['hamstrings', 'lowerback']],
  ex_dead: [['hamstrings', 'glutes', 'lowerback'], ['traps', 'forearms']], ex_ohp: [['shoulders'], ['triceps', 'traps']],
  ex_row: [['lats'], ['biceps', 'lowerback']], ex_pull: [['lats'], ['biceps', 'forearms']], ex_dip: [['triceps', 'chest'], ['shoulders']],
  ex_curl: [['biceps'], ['forearms']], ex_lat: [['lats'], ['biceps']], ex_lunge: [['quads', 'glutes'], ['hamstrings', 'calves']],
  ex_run: [['quads', 'calves'], ['hamstrings']], ex_yoga: [[], []]
};

export function buildMock(today = new Date()): AppState {
  const now = today.toISOString();
  const EQUIP: Record<string, string[]> = {
    ex_bench: ['barbell', 'bench'], ex_squat: ['barbell'], ex_dead: ['barbell'], ex_ohp: ['barbell'], ex_row: ['barbell'],
    ex_pull: ['pullup_bar'], ex_dip: ['bodyweight'], ex_curl: ['dumbbell', 'bench'], ex_lat: ['cable'],
    ex_lunge: ['dumbbell'], ex_run: ['bodyweight'], ex_yoga: ['bodyweight']
  };
  const ex = (id: string, name: string, notes = ''): Exercise => ({
    id, name, notes, photoUrl: null, createdAt: now, equipment: EQUIP[id],
    muscles: { primary: MUSCLE_MAP[id][0], secondary: MUSCLE_MAP[id][1] }
  });
  const exercises = [
    ex('ex_bench', 'Barbell Bench Press', 'Pause 1s on chest'), ex('ex_squat', 'Back Squat', 'High bar, ATG'),
    ex('ex_dead', 'Conventional Deadlift'), ex('ex_ohp', 'Overhead Press'), ex('ex_row', 'Barbell Row', 'Pendlay'),
    ex('ex_pull', 'Pull-up', 'Dead hang start'), ex('ex_dip', 'Dip'), ex('ex_curl', 'Incline DB Curl'),
    ex('ex_lat', 'Lat Pulldown'), ex('ex_lunge', 'Walking Lunge'), ex('ex_run', 'Easy Run', 'Zone 2'),
    ex('ex_yoga', 'Yoga Flow', '20 min mobility')
  ];
  const re = (exerciseId: string, order: number, goals: SetGoal[]) => ({ exerciseId, order, goals, goalUpdatedAt: now });
  const routines: Routine[] = [
    { id: 'rt_push', name: 'Push A', exercises: [re('ex_bench', 0, times(4, goal(5, 102.5, 120))), re('ex_ohp', 1, times(3, goal(8, 55, 90))), re('ex_dip', 2, times(3, goal(10, 0, 60))), re('ex_curl', 3, times(3, goal(12, 14, 45)))] },
    { id: 'rt_pull', name: 'Pull A', exercises: [re('ex_dead', 0, times(3, goal(3, 160, 180))), re('ex_pull', 1, times(4, goal(8, 0, 90))), re('ex_row', 2, times(3, goal(8, 80, 90))), re('ex_lat', 3, times(3, goal(12, 60, 60)))] },
    { id: 'rt_legs', name: 'Legs A', exercises: [re('ex_squat', 0, times(5, goal(5, 130, 150))), re('ex_lunge', 1, times(3, goal(10, 20, 90)))] },
    { id: 'rt_cardio', name: 'Conditioning', exercises: [re('ex_run', 0, [goal(1, 0, 0)])] },
    { id: 'rt_mobility', name: 'Mobility', exercises: [re('ex_yoga', 0, [goal(1, 0, 0)])] }
  ];

  const start = addDays(today, -29);
  const plans: Plan[] = [
    { id: 'pl_ppl', name: 'PPL — Block 4', kind: 'weekly', subscribed: true, startedAt: start.toISOString(),
      days: { mon: 'rt_push', tue: 'rt_pull', wed: 'rt_legs', thu: 'rt_push', fri: 'rt_pull', sat: 'rt_legs', sun: null } },
    { id: 'pl_cardio', name: 'Z2 Conditioning', kind: 'weekly', subscribed: true, startedAt: addDays(start, 7).toISOString(),
      days: { mon: null, tue: 'rt_cardio', wed: null, thu: 'rt_cardio', fri: null, sat: 'rt_cardio', sun: 'rt_cardio' } },
    { id: 'pl_mobility', name: 'Daily Mobility', kind: 'monthly', subscribed: true, startedAt: addDays(start, 14).toISOString(),
      days: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [String(i + 1), i % 2 === 0 ? 'rt_mobility' : null])) },
    { id: 'pl_ul', name: 'Upper / Lower 4-day', kind: 'weekly', subscribed: false, startedAt: null,
      days: { mon: 'rt_push', tue: 'rt_legs', wed: null, thu: 'rt_pull', fri: 'rt_legs', sat: null, sun: null } }
  ];

  // 28 days of past history from subscribed plans (today left empty so it can be logged live).
  const sessions: Session[] = [];
  for (let off = 0; off < 29; off++) {
    const d = addDays(start, off);
    if (ymd(d) >= ymd(today)) break;
    plans.filter((p) => p.subscribed).forEach((p, ci) => routinesOn(p, dayKey(p, d, WEEKDAYS)).forEach((rid, ri) => {
      if (Math.random() < 0.15) return;
      const r = routines.find((x) => x.id === rid);
      if (!r) return;
      const id = `s_${off}_${ci}_${ri}`;
      const logs: SetLog[] = [];
      r.exercises.forEach((rex) =>
        rex.goals.forEach((g0, i) => {
          const prog = 0.86 + (off / 28) * 0.14;
          const w = g0.weight ? Math.round((g0.weight * prog + (Math.random() - 0.5) * g0.weight * 0.04) / 2.5) * 2.5 : 0;
          const g = { ...g0, weight: w };
          const v = Math.random();
          let actual; let hitGoal = false;
          if (v < 0.7) { actual = { reps: g.reps, weight: g.weight }; hitGoal = true; }
          else if (v < 0.85) actual = { reps: Math.max(1, g.reps - 1 - Math.floor(Math.random() * 2)), weight: g.weight };
          else actual = { reps: g.reps + Math.floor(Math.random() * 3), weight: g.weight };
          const at = new Date(d); at.setHours(18, 0 + logs.length * 3);
          logs.push({ sessionId: id, exerciseId: rex.exerciseId, setIndex: i, goalSnapshot: g, actual, hitGoal, loggedAt: at.toISOString() });
        })
      );
      const t0 = new Date(d); t0.setHours(18);
      sessions.push({ id, planId: p.id, routineId: rid, date: ymd(d), startedAt: t0.toISOString(), endedAt: logs[logs.length - 1].loggedAt, logs });
    }));
  }

  // ~60 days of weigh-ins every 2-3 days, trending down with day-to-day noise.
  const weights: WeightEntry[] = [];
  for (let off = 60; off >= 0; off -= 2 + (off % 3 === 0 ? 1 : 0)) {
    const day = ymd(addDays(today, -off));
    const kg = Math.round((81.5 + (off / 60) * 2.6 + (Math.random() - 0.5) * 0.8) * 10) / 10;
    weights.push({ id: day, date: day, kg });
  }

  return { exercises, routines, plans, sessions, weights, days: [] };
}
