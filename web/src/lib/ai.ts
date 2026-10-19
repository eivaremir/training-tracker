// AI coach: builds a prompt from the user's own data and sends it to the provider chosen in Settings.
import { api, ApiError } from './api';
import { claudeReview, describeClaudeError, getClaudeKey, DEFAULT_CLAUDE_MODEL } from './anthropic';
import { store } from './store.svelte';
import { uid, addDays, parseYmd, ymd } from './dates';
import { unit, toUnit, fmtWeight, isBodyweight } from './units';
import { EQUIPMENT } from './equipment';
import { MUSCLES } from './muscles';
import type { AiReview, Exercise, Session, SetGoal, SetLog } from './types';

// Same instructions the API uses for Bedrock (api/src/ai.rs) — keep them in sync.
export const COACH_SYSTEM = "You are an experienced strength and conditioning coach reviewing a user's training log. \
Base every observation only on the data provided. Be specific and concise: what went well, what to watch, \
and 1-3 concrete suggestions for the next session (load, reps, rest, exercise choice), measured against its listed goals when given. \
Use the weight unit the log uses (kg or lb); a weight of 0 means bodyweight. \
Format the answer in concise Markdown: short '###' sections (for example What went well, Watch, Next session), bullet lists, **bold** for key numbers; no tables. \
Do not give medical advice; if something suggests pain or injury, recommend consulting a professional. \
Reply in English unless the user's question is clearly written in another language, then use that language.";

// The API takes up to 24,000 characters (ai::MAX_PROMPT_CHARS in api/src/ai.rs).
const MAX_PROMPT = 20000;
const HISTORY_SESSIONS = 3;
// Gaps between logged sets outside this range come from batch or after-the-fact logging, not rest.
const GAP_MIN_S = 10;
const GAP_MAX_S = 30 * 60;

const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);
const mmss = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const weekday = (date: string) => parseYmd(date).toLocaleDateString('en-US', { weekday: 'short' });
const labels = (ids: string[] | undefined, names: Record<string, string>) => (ids ?? []).map((id) => (names[id] ?? id).toLowerCase()).join(', ');

/** The weigh-in that applies on a date: the last one on or before it, else the first one after. */
const bodyKgOn = (date: string) => (store.weights.filter((w) => w.date <= date).at(-1) ?? store.weights[0])?.kg ?? null;

/** "102.5 kg", or "bodyweight" for a 0 on a bodyweight exercise. */
const load = (kg: number, bw: boolean) => (kg === 0 && bw ? 'bodyweight' : fmtWeight(kg));
/** History shorthand: "5×102.5", "8×BW". */
const short = (s: { reps: number; weight: number }, bw: boolean) => `${s.reps}×${s.weight === 0 && bw ? 'BW' : toUnit(s.weight)}`;

const sessionTitle = (s: Session) => {
  if (!s.planId) return 'Extra workout (outside plan)';
  const r = s.routineId ? store.routine(s.routineId) : undefined;
  const p = store.plans.find((x) => x.id === s.planId);
  return `${r?.name ?? 'Routine'}${p ? ` (plan: ${p.name})` : ''}`;
};

/** Equipment, muscles and, for bodyweight moves, the body weight that applies on `date`. */
function exerciseInfo(ex: Exercise | undefined, date: string): string[] {
  if (!ex) return [];
  const out: string[] = [];
  if (ex.equipment?.length) out.push(labels(ex.equipment, EQUIPMENT));
  if (ex.muscles?.primary?.length) out.push(`primary ${labels(ex.muscles.primary, MUSCLES)}`);
  if (ex.muscles?.secondary?.length) out.push(`secondary ${labels(ex.muscles.secondary, MUSCLES)}`);
  if (isBodyweight(ex.equipment)) {
    const kg = bodyKgOn(date);
    out.push(`bodyweight exercise${kg ? `, body weight ${fmtWeight(kg)}` : ''}`);
  }
  return out;
}

/** Seconds from the previous performed set to each set ("exerciseId#setIndex"): rest plus doing the set. */
function setGaps(logs: SetLog[]): Map<string, number> {
  const done = logs.filter((l) => l.actual).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const out = new Map<string, number>();
  done.forEach((l, i) => {
    const sec = i ? (Date.parse(l.loggedAt) - Date.parse(done[i - 1].loggedAt)) / 1000 : 0;
    if (sec >= GAP_MIN_S && sec <= GAP_MAX_S) out.set(`${l.exerciseId}#${l.setIndex}`, sec);
  });
  return out;
}

/** "18:02–18:55 (53 min)": session start to the last performed set, or to Finish if it was tapped soon after. */
function sessionTime(s: Session): string | null {
  const done = s.logs.filter((l) => l.actual).map((l) => Date.parse(l.loggedAt));
  if (!done.length) return null;
  const start = Math.min(...[Date.parse(s.startedAt), ...done].filter(Number.isFinite));
  let end = Math.max(...done);
  const fin = s.endedAt ? Date.parse(s.endedAt) : NaN;
  if (fin > end && fin - end <= 15 * 60_000) end = fin;
  const min = Math.round((end - start) / 60_000);
  return min >= 1 ? `${clock(start)}–${clock(end)} (${min} min)` : null;
}

function describeSession(s: Session): string {
  const byEx = new Map<string, SetLog[]>();
  s.logs.forEach((l) => byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l]));
  const lines = [`## ${sessionTitle(s)}`];
  const r = s.routineId ? store.routine(s.routineId) : undefined;
  if (r) {
    const total = r.exercises.reduce((n, e) => n + e.goals.length, 0);
    const missing = r.exercises.filter((e) => e.goals.length && !byEx.has(e.exerciseId))
      .map((e) => `${store.exercise(e.exerciseId)?.name ?? e.exerciseId} (${e.goals.length} sets)`);
    lines.push(`Sets logged: ${s.logs.length}/${total}${missing.length ? `; not logged: ${missing.join(', ')}` : ''}`);
  }
  // Extra workouts are entered after the fact, so their log times say nothing about pace or rest.
  const time = s.planId ? sessionTime(s) : null;
  if (time) lines.push(`Time: ${time}`);
  const gaps = s.planId ? setGaps(s.logs) : new Map<string, number>();
  for (const [exId, logs] of byEx) {
    const ex = store.exercise(exId);
    const bw = isBodyweight(ex?.equipment);
    const rests = new Set(logs.flatMap((l) => (l.goalSnapshot ? [l.goalSnapshot.restSeconds] : [])));
    const info = exerciseInfo(ex, s.date);
    const rest = rests.size === 1 ? [...rests][0] : 0;
    if (rest) info.push(`rest goal ${mmss(rest)}`);
    lines.push(`- ${ex?.name ?? exId}${info.length ? ` [${info.join('; ')}]` : ''}:`);
    logs.sort((a, b) => a.setIndex - b.setIndex).forEach((l) => {
      const g = l.goalSnapshot;
      const did = l.actual ? `${l.actual.reps} rep${l.actual.reps === 1 ? '' : 's'} × ${load(l.actual.weight, bw)}` : 'skipped';
      const verdict = l.actual ? (l.hitGoal ? ', hit' : ', missed') : '';
      const setRest = rests.size > 1 && g?.restSeconds ? `, rest goal ${mmss(g.restSeconds)}` : '';
      const goal = g ? ` (goal ${g.reps} × ${load(g.weight, bw)}${verdict}${setRest})` : '';
      const gap = gaps.get(`${exId}#${l.setIndex}`);
      lines.push(`  - set ${l.setIndex + 1}: ${did}${goal}${gap ? `, after ${mmss(gap)}` : ''}`);
    });
  }
  if (s.notes?.trim()) lines.push(`Notes: ${s.notes.trim()}`);
  return lines.join('\n');
}

/** "5×100 hit", "6×100 hit (goal 5×100)", "4×100 missed (goal 5×100)", "skipped (goal 5×100)"; extra sets have no goal. */
function historySet(l: SetLog, bw: boolean): string {
  const g = l.goalSnapshot;
  if (!l.actual) return g ? `skipped (goal ${short(g, bw)})` : 'skipped';
  const did = short(l.actual, bw);
  if (!g) return did;
  const goal = short(g, bw);
  return `${did} ${l.hitGoal ? 'hit' : 'missed'}${goal === did ? '' : ` (goal ${goal})`}`;
}

/** "4 sets of 5 × 102.5 kg, rest 2:00; 3 × 105 kg, rest 3:00" (identical consecutive sets grouped). */
function goalsText(goals: SetGoal[], bw: boolean): string {
  const runs: { g: SetGoal; n: number }[] = [];
  for (const g of goals) {
    const last = runs.at(-1);
    if (last && last.g.reps === g.reps && last.g.weight === g.weight && last.g.restSeconds === g.restSeconds) last.n++;
    else runs.push({ g, n: 1 });
  }
  return runs.map(({ g, n }) => `${n > 1 ? `${n} sets of ` : ''}${g.reps} × ${load(g.weight, bw)}${g.restSeconds ? `, rest ${mmss(g.restSeconds)}` : ''}`).join('; ');
}

/** Next day after `date` (and not before today) a subscribed plan schedules this session's routine, unless already finished. */
function nextScheduled(s: Session, date: string) {
  if (!s.routineId) return null;
  const today = store.todayStr;
  const from = parseYmd(date < today ? today : ymd(addDays(parseYmd(date), 1)));
  for (let i = 0; i < 62; i++) {
    const d = addDays(from, i);
    const items = store.itemsFor(d).filter((it) => it.routine.id === s.routineId);
    const it = items.find((x) => x.plan.id === s.planId) ?? items[0];
    if (it && !store.sessionFor(it.plan.id, it.routine.id, ymd(d))?.endedAt) return { ...it, date: ymd(d) };
  }
  return null;
}

/** The day's training, the next scheduled session of the same routines, and recent history of the same exercises. */
export function buildDayPrompt(date: string, question: string): string {
  const sessions = store.sessions.filter((s) => s.date === date && s.logs.length);
  const day = sessions.length ? sessions.map(describeSession).join('\n\n') : 'No sets logged this day.';
  const timed = sessions.some((s) => s.planId && setGaps(s.logs).size);
  const head = [`Training log for ${date} (${weekday(date)}). Weights in ${unit()}.${timed ? ' "after m:ss" = time since the previous set was logged (rest plus doing the set).' : ''}`];

  const w = store.weights.filter((x) => x.date <= date).slice(-5);
  if (w.length) head.push(`Body weight: ${w.map((x) => `${x.date} ${fmtWeight(x.kg)}`).join(', ')}${store.settings.weightGoalKg ? `; goal ${fmtWeight(store.settings.weightGoalKg)}` : ''}.`);
  head.push(day);
  const notes = store.day(date)?.notes?.trim();
  if (notes) head.push(`Day notes: ${notes}`);

  const next: string[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    const n = nextScheduled(s, date);
    if (!n || seen.has(n.routine.id)) continue;
    seen.add(n.routine.id);
    const goals = [...n.routine.exercises].sort((a, b) => a.order - b.order).filter((re) => re.goals.length).map((re) => {
      const ex = store.exercise(re.exerciseId);
      return `- ${ex?.name ?? re.exerciseId}: ${goalsText(re.goals, isBodyweight(ex?.equipment))}`;
    });
    next.push(`Next scheduled ${n.routine.name}: ${weekday(n.date)} ${n.date} (plan: ${n.plan.name}). Goals:\n${goals.join('\n')}`);
  }

  // Earlier sessions per exercise, newest first.
  const history = [...new Set(sessions.flatMap((s) => s.logs.map((l) => l.exerciseId)))].map((id) => {
    const ex = store.exercise(id);
    const bw = isBodyweight(ex?.equipment);
    const rows = store.sessions.filter((s) => s.date < date && s.logs.some((l) => l.exerciseId === id))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, HISTORY_SESSIONS)
      .map((s) => {
        const sets = s.logs.filter((l) => l.exerciseId === id).sort((a, b) => a.setIndex - b.setIndex);
        return `  - ${s.date}${s.planId ? '' : ' (extra)'}: ${sets.map((l) => historySet(l, bw)).join(', ')}`;
      });
    return { name: ex?.name ?? id, rows };
  }).filter((h) => h.rows.length);
  const historyText = (keep: number, count = history.length) => count
    ? `Recent history of these exercises (newest first; reps×weight, BW = bodyweight):\n${history.slice(0, count).map((h) => `- ${h.name}:\n${h.rows.slice(0, keep).join('\n')}`).join('\n')}`
    : '';

  // Over the limit: trim history (older sessions, then whole exercises) and only then the day itself.
  // The header goes first and the question last, so both always survive.
  const q = `Question: ${question.trim()}`.slice(0, MAX_PROMPT / 4);
  const build = (hist: string) => [...head, hist, ...next, q].filter(Boolean).join('\n\n');
  let prompt = build(historyText(HISTORY_SESSIONS));
  for (let keep = HISTORY_SESSIONS - 1; prompt.length > MAX_PROMPT && keep >= 1; keep--) prompt = build(historyText(keep));
  for (let count = history.length - 1; prompt.length > MAX_PROMPT && count >= 0; count--) prompt = build(historyText(1, count));
  if (prompt.length > MAX_PROMPT) {
    const tail = [...next, q].join('\n\n');
    prompt = `${head.join('\n\n').slice(0, Math.max(0, MAX_PROMPT - tail.length - 20))} […cut]\n\n${tail}`.slice(-MAX_PROMPT);
  }
  return prompt;
}

export const aiConfigured = () => {
  const s = store.settings;
  if (s.aiProvider === 'bedrock') return !!s.aiModel;
  if (s.aiProvider === 'anthropic') return !!getClaudeKey();
  return false;
};

/** Asks the configured provider and stores the answer on the day's log. */
export async function askCoach(date: string, question: string): Promise<AiReview> {
  const s = store.settings;
  const prompt = buildDayPrompt(date, question);
  let answer: string, model: string;
  if (s.aiProvider === 'anthropic') {
    model = s.aiModel || DEFAULT_CLAUDE_MODEL;
    try { answer = await claudeReview(getClaudeKey(), model, COACH_SYSTEM, prompt); }
    catch (e) { throw new Error(await describeClaudeError(e)); }
  } else if (s.aiProvider === 'bedrock' && s.aiModel) {
    model = s.aiModel;
    try { answer = (await api.aiReview(model, prompt)).answer; }
    catch (e) { throw new Error(e instanceof ApiError ? e.message : 'The AI request failed. Try again.'); }
  } else {
    throw new Error('Choose an AI provider in Settings first.');
  }
  const review: AiReview = { id: uid('ai'), createdAt: new Date().toISOString(), provider: s.aiProvider!, model, question: question.trim(), answer };
  const day = store.day(date) ?? { id: date, date, notes: '', reviews: [] };
  store.saveDay({ ...plain(day), reviews: [...day.reviews, review].slice(-50) });
  return review;
}

// Plain copy of a (possibly reactive) object; this module is not a .svelte.ts file, so no $state.snapshot.
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
