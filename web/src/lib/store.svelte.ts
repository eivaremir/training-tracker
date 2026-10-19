// App-wide reactive state. Mutations update local state immediately, then persist
// (to the Rust API when VITE_API_URL is set, otherwise to localStorage).
import { routinesOn, dayKey } from './plans';
import { api, apiEnabled, UnauthorizedError, type Collection } from './api';
import { buildMock } from './mock';
import { WEEKDAYS, ymd } from './dates';
import { meetsGoal } from './units';
import type { AppState, DayLog, Exercise, ID, Plan, Routine, Session, Settings, WeightEntry } from './types';

const LS_KEY = 'tt-state-v1';

class Store {
  exercises = $state<Exercise[]>([]);
  routines = $state<Routine[]>([]);
  plans = $state<Plan[]>([]);
  sessions = $state<Session[]>([]);
  days = $state<DayLog[]>([]);
  weights = $state<WeightEntry[]>([]);
  settings = $state<Settings>(defaultSettings());
  loaded = $state(false);
  error = $state<string | null>(null);
  theme = $state<'dark' | 'light'>('dark');
  restEnabled = $state(true);

  get today() { return new Date(); }
  get todayStr() { return ymd(new Date()); }

  async init() {
    this.loaded = false;
    try {
      const s = apiEnabled ? await api.state() : this.readLocal();
      this.apply(s);
    } catch (e) {
      if (e instanceof UnauthorizedError) return; // redirected to /login
      this.error = `Could not load data: ${(e as Error).message}`;
    }
    this.loaded = true;
  }

  /** Drop the signed-out user's data from memory. */
  reset() {
    this.apply({ exercises: [], routines: [], plans: [], sessions: [] });
    this.loaded = false;
    this.error = null;
  }

  private readLocal(): AppState {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* fall through to demo data */ }
    const s = buildMock();
    this.writeLocal(s);
    return s;
  }
  private writeLocal(s: AppState) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
  }
  private apply(s: AppState) {
    this.exercises = s.exercises; this.routines = s.routines; this.plans = s.plans; this.sessions = s.sessions;
    this.days = s.days ?? []; this.weights = s.weights ?? [];
    this.settings = { ...defaultSettings(), ...(s.settings ?? {}) };
  }
  private snapshot(): AppState {
    return $state.snapshot({
      exercises: this.exercises, routines: this.routines, plans: this.plans, sessions: this.sessions,
      days: this.days, weights: this.weights, settings: this.settings
    });
  }

  private persist(ops: { put?: [Collection, { id: string }][]; del?: [Collection, string][] }) {
    if (!apiEnabled) { this.writeLocal(this.snapshot()); return; }
    const calls = [
      ...(ops.put || []).map(([c, item]) => api.put(c, $state.snapshot(item))),
      ...(ops.del || []).map(([c, id]) => api.del(c, id))
    ];
    Promise.all(calls).catch((e) => {
      if (!(e instanceof UnauthorizedError)) this.error = `Sync failed: ${(e as Error).message}`;
    });
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('tt-theme', this.theme); } catch { /* ignore */ }
  }

  /** Load the demo dataset into the backend (API mode) or reset localStorage (offline). */
  async loadDemo() {
    const s = buildMock();
    this.apply(s);
    if (apiEnabled) await api.seed(s).catch((e) => { if (!(e instanceof UnauthorizedError)) this.error = `Seed failed: ${(e as Error).message}`; });
    else this.writeLocal(s);
  }

  // ---- lookups ----
  exercise = (id: string) => this.exercises.find((e) => e.id === id);
  routine = (id: string) => this.routines.find((r) => r.id === id);

  /** Routines scheduled today (or on `d`) across subscribed plans. */
  itemsFor(d: Date) {
    return this.plans
      .filter((p) => p.subscribed)
      .flatMap((p) => routinesOn(p, dayKey(p, d, WEEKDAYS)).map((rid) => {
        const routine = this.routine(rid);
        return routine ? { plan: p, routine } : null;
      }))
      .filter((x): x is { plan: Plan; routine: Routine } => !!x);
  }

  day = (date: string) => this.days.find((d) => d.date === date);

  /** Extra (unplanned) workout for a date, if one exists. */
  extraSession = (date: string) => this.sessions.find((s) => s.date === date && !s.planId);

  sessionFor(planId: string, routineId: string, date: string) {
    return this.sessions.find((s) => s.planId === planId && s.routineId === routineId && s.date === date);
  }

  // ---- mutations ----
  saveExercise(ex: Exercise) {
    upsert(this.exercises, ex);
    this.persist({ put: [['exercises', ex]] });
  }
  deleteExercise(id: string) {
    this.exercises = this.exercises.filter((e) => e.id !== id);
    const touched = this.routines.filter((r) => r.exercises.some((x) => x.exerciseId === id));
    touched.forEach((r) => (r.exercises = r.exercises.filter((x) => x.exerciseId !== id)));
    this.persist({ del: [['exercises', id]] }); // server cascades into routines too
  }
  saveRoutine(r: Routine) {
    upsert(this.routines, r);
    this.persist({ put: [['routines', r]] });
  }
  /** Plans that schedule this routine on at least one day. */
  plansUsingRoutine = (id: string) => this.plans.filter((p) => Object.keys(p.days).some((k) => routinesOn(p, k).includes(id)));

  /** Only routines that no plan uses can be deleted (the API enforces this too). */
  deleteRoutine(id: string) {
    if (this.plansUsingRoutine(id).length) return false;
    this.routines = this.routines.filter((r) => r.id !== id);
    this.persist({ del: [['routines', id]] });
    return true;
  }
  savePlan(p: Plan) {
    upsert(this.plans, p);
    this.persist({ put: [['plans', p]] });
  }
  deletePlan(id: string) {
    this.plans = this.plans.filter((p) => p.id !== id);
    this.persist({ del: [['plans', id]] });
  }
  setSubscribed(id: string, on: boolean) {
    const p = this.plans.find((x) => x.id === id);
    if (!p) return;
    p.subscribed = on;
    if (on) p.startedAt = p.startedAt || new Date().toISOString();
    this.persist({ put: [['plans', p]] });
  }
  deleteSession(id: string) {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.persist({ del: [['sessions', id]] });
  }
  saveDay(d: DayLog) {
    upsert(this.days, d);
    this.persist({ put: [['days', this.days.find((x) => x.id === d.id)!]] });
  }
  saveWeight(w: WeightEntry) {
    upsert(this.weights, w);
    this.weights.sort((a, b) => a.date.localeCompare(b.date));
    this.persist({ put: [['weights', w]] });
  }
  deleteWeight(id: string) {
    this.weights = this.weights.filter((w) => w.id !== id);
    this.persist({ del: [['weights', id]] });
  }
  /** Settings are saved as a whole (PUT /settings). */
  async saveSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    if (!apiEnabled) { this.writeLocal(this.snapshot()); return; }
    try { await api.putSettings($state.snapshot(this.settings)); }
    catch (e) { if (!(e instanceof UnauthorizedError)) this.error = `Couldn't save settings: ${(e as Error).message}`; throw e; }
  }

  saveSession(s: Session) {
    upsert(this.sessions, s);
    this.persist({ put: [['sessions', this.sessions.find((x) => x.id === s.id)!]] });
  }

  /** The session a logged set belongs to: by its sessionId, else by a set that matches on date/exercise/index. */
  private sessionOfLog(key: LogKey) {
    return this.sessions.find((s) => s.id === key.sessionId)
      ?? this.sessions.find((s) => s.date === key.date && s.logs.some((l) => l.exerciseId === key.exerciseId && l.setIndex === key.setIndex));
  }

  /**
   * Correct one logged set's actual reps/weight (weight already in kg). Recomputes hitGoal against the
   * log's goalSnapshot and re-persists the session, so historical charts pick up the fixed value.
   */
  updateLog(key: LogKey, actual: { reps: number; weight: number }) {
    const s = this.sessionOfLog(key);
    const log = s?.logs.find((l) => l.exerciseId === key.exerciseId && l.setIndex === key.setIndex);
    if (!s || !log) return;
    log.actual = actual;
    const g = log.goalSnapshot;
    log.hitGoal = g ? actual.reps >= g.reps && meetsGoal(actual.weight, g.weight) : true;
    this.saveSession(s);
  }

  /** Remove a single logged set; if that empties the session (and it has no notes), delete the session. */
  deleteLog(key: LogKey) {
    const s = this.sessionOfLog(key);
    if (!s) return;
    const logs = $state.snapshot(s.logs).filter((l) => !(l.exerciseId === key.exerciseId && l.setIndex === key.setIndex));
    if (logs.length || s.notes) this.saveSession({ ...$state.snapshot(s), logs });
    else this.deleteSession(s.id);
  }
}

/** Identifies one logged set across all sessions. */
export interface LogKey { sessionId: ID; date: string; exerciseId: ID; setIndex: number }

export function defaultSettings(): Settings {
  let timezone = 'UTC';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* old browsers */ }
  return {
    weightGoalKg: null, aiProvider: null, aiModel: null,
    reminders: { enabled: false, start: '08:00', end: '20:00', everyHours: 4, onlyWhenDue: true, timezone }
  };
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.push(item);
}

export const store = new Store();
