// Shared data shapes — the same JSON the Rust API reads and writes.
export type ID = string;
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type PlanKind = 'weekly' | 'monthly';

export interface Muscles { primary: string[]; secondary: string[] }

export interface Exercise {
  id: ID;
  name: string;
  photoUrl: string | null;
  notes: string;
  muscles: Muscles;
  createdAt: string;
  /** Equipment ids from lib/equipment.ts. */
  equipment?: string[];
  /** Step-by-step how-to, one entry per step. */
  instructions?: string[];
  /** Absolute image URLs (e.g. from the catalog). */
  images?: string[];
  level?: string | null;
  category?: string | null;
  /** Catalog id this exercise was added from, if any. */
  sourceId?: string | null;
}

/** Read-only entry from static/catalog/exercises.json. */
export interface CatalogExercise {
  id: string;
  name: string;
  level: string | null;
  category: string | null;
  force: string | null;
  mechanic: string | null;
  equipment: string[];
  muscles: Muscles;
  instructions: string[];
  /** Paths relative to the catalog's imageBase. */
  images: string[];
}

export interface SetGoal { reps: number; weight: number; restSeconds: number }

export interface RoutineExercise {
  exerciseId: ID;
  order: number;
  goals: SetGoal[];
  goalUpdatedAt: string;
}

export interface Routine { id: ID; name: string; exercises: RoutineExercise[] }

export interface Plan {
  id: ID;
  name: string;
  kind: PlanKind;
  subscribed: boolean;
  startedAt: string | null;
  /** weekly: keys mon..sun; monthly: keys "1".."31". Value = routineId or null (rest). */
  days: Record<string, ID | null>;
}

export interface SetLog {
  sessionId: ID;
  exerciseId: ID;
  setIndex: number;
  /** Goal at log time; absent for extra (unplanned) sets. */
  goalSnapshot?: SetGoal | null;
  actual: { reps: number; weight: number } | null; // null = skipped
  hitGoal: boolean;
  loggedAt: string;
}

export interface Session {
  id: ID;
  /** Null for extra workouts logged outside a plan. */
  planId: ID | null;
  routineId: ID | null;
  date: string; // YYYY-MM-DD (local)
  startedAt: string;
  endedAt: string | null;
  logs: SetLog[];
  notes?: string;
}

export interface AiReview { id: ID; createdAt: string; provider: string; model: string; question: string; answer: string }

/** Per-day journal. id === date. */
export interface DayLog { id: string; date: string; notes: string; reviews: AiReview[] }

/** Body weight. id === date. */
export interface WeightEntry { id: string; date: string; kg: number }

export interface Reminders {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;
  everyHours: number;
  onlyWhenDue: boolean;
  timezone: string;
}

export interface Settings {
  weightGoalKg: number | null;
  aiProvider: 'bedrock' | 'anthropic' | null;
  aiModel: string | null;
  reminders: Reminders;
}

export interface AppState {
  exercises: Exercise[];
  routines: Routine[];
  plans: Plan[];
  sessions: Session[];
  days?: DayLog[];
  weights?: WeightEntry[];
  settings?: Settings;
}
