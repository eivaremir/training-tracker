// AI coach: builds a prompt from the user's own data and sends it to the provider chosen in Settings.
import { api, ApiError } from './api';
import { claudeReview, describeClaudeError, getClaudeKey, DEFAULT_CLAUDE_MODEL } from './anthropic';
import { store } from './store.svelte';
import { uid } from './dates';
import type { AiReview, Session } from './types';

// Same instructions the API uses for Bedrock (api/src/ai.rs) — keep them in sync.
export const COACH_SYSTEM = "You are an experienced strength and conditioning coach reviewing a user's training log. \
Base every observation only on the data provided. Be specific and concise: what went well, what to watch, \
and 1-3 concrete suggestions for the next session (load, reps, rest, exercise choice). Use kg; a weight of 0 kg means bodyweight. \
Format the answer in concise Markdown: short '###' sections (for example What went well, Watch, Next session), bullet lists, **bold** for key numbers; no tables. \
Do not give medical advice; if something suggests pain or injury, recommend consulting a professional. \
Reply in English unless the user's question is clearly written in another language, then use that language.";

const MAX_PROMPT = 20000;

const sessionTitle = (s: Session) => {
  if (!s.planId) return 'Extra workout (outside plan)';
  const r = s.routineId ? store.routine(s.routineId) : undefined;
  const p = store.plans.find((x) => x.id === s.planId);
  return `${r?.name ?? 'Routine'}${p ? ` (plan: ${p.name})` : ''}`;
};

function describeSession(s: Session): string {
  const byEx = new Map<string, Session['logs']>();
  s.logs.forEach((l) => byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l]));
  const lines = [`## ${sessionTitle(s)}`];
  if (s.routineId) {
    const r = store.routine(s.routineId);
    const total = r?.exercises.reduce((n, e) => n + e.goals.length, 0) ?? 0;
    lines.push(`Sets logged: ${s.logs.length}/${total}`);
  }
  for (const [exId, logs] of byEx) {
    lines.push(`- ${store.exercise(exId)?.name ?? exId}:`);
    logs.sort((a, b) => a.setIndex - b.setIndex).forEach((l) => {
      const did = l.actual ? `${l.actual.reps} reps × ${l.actual.weight} kg` : 'skipped';
      const goal = l.goalSnapshot ? ` (goal ${l.goalSnapshot.reps} × ${l.goalSnapshot.weight} kg${l.hitGoal ? ', hit' : ', missed'})` : '';
      lines.push(`  - set ${l.setIndex + 1}: ${did}${goal}`);
    });
  }
  if (s.notes?.trim()) lines.push(`Notes: ${s.notes.trim()}`);
  return lines.join('\n');
}

/** The day's training plus recent history of the same exercises, for context. */
export function buildDayPrompt(date: string, question: string): string {
  const sessions = store.sessions.filter((s) => s.date === date && s.logs.length);
  const parts = [`Training log for ${date}. All weights in kg; 0 kg means bodyweight.`];

  const w = store.weights.filter((x) => x.date <= date).slice(-5);
  if (w.length) parts.push(`Body weight: ${w.map((x) => `${x.date} ${x.kg}`).join(', ')}${store.settings.weightGoalKg ? `; goal ${store.settings.weightGoalKg}` : ''}.`);

  parts.push(sessions.length ? sessions.map(describeSession).join('\n\n') : 'No sets logged this day.');
  const notes = store.day(date)?.notes?.trim();
  if (notes) parts.push(`Day notes: ${notes}`);

  const exIds = new Set(sessions.flatMap((s) => s.logs.map((l) => l.exerciseId)));
  const history: string[] = [];
  for (const id of exIds) {
    const prev = store.sessions.filter((s) => s.date < date && s.logs.some((l) => l.exerciseId === id && l.actual))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    if (!prev.length) continue;
    const rows = prev.map((s) => {
      const sets = s.logs.filter((l) => l.exerciseId === id && l.actual).map((l) => `${l.actual!.reps}×${l.actual!.weight}`);
      return `${s.date}: ${sets.join(', ')}`;
    });
    history.push(`- ${store.exercise(id)?.name ?? id}: ${rows.join(' | ')}`);
  }
  if (history.length) parts.push(`Recent history of these exercises:\n${history.join('\n')}`);

  parts.push(`Question: ${question.trim()}`);
  const prompt = parts.join('\n\n');
  return prompt.length > MAX_PROMPT ? prompt.slice(0, MAX_PROMPT) : prompt;
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
