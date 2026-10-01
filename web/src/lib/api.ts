import type { AppState, Settings } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

/** True when the app talks to the Rust API; false = offline demo mode backed by localStorage. */
export const apiEnabled = !!BASE;

export type Collection = 'exercises' | 'routines' | 'plans' | 'sessions' | 'days' | 'weights';

export interface PublicUser { id: string; email: string }
export interface LoginResponse { token: string; expiresAt: number; user: PublicUser }

/** Thrown when the API rejects the session token; the auth layer handles the redirect. */
export class UnauthorizedError extends Error {}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Wired up by auth.svelte.ts (kept as callbacks to avoid an import cycle).
let hooks: { token: () => string | null; onUnauthorized: () => void } = { token: () => null, onUnauthorized: () => {} };
export const configureAuth = (h: typeof hooks) => (hooks = h);

async function req<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
  const token = authed ? hooks.token() : null;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401 && authed) {
    hooks.onUnauthorized();
    throw new UnauthorizedError('Session expired');
  }
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error as string).catch(() => res.statusText);
    throw new ApiError(res.status, msg || `${method} ${path} failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (email: string, password: string) => req<LoginResponse>('POST', '/auth/login', { email, password }, false),
  state: () => req<AppState>('GET', '/state'),
  put: <T extends { id: string }>(c: Collection, item: T) => req<T>('PUT', `/${c}/${encodeURIComponent(item.id)}`, item),
  del: (c: Collection, id: string) => req<void>('DELETE', `/${c}/${encodeURIComponent(id)}`),
  seed: (state: AppState) => req<void>('POST', '/seed', state),
  putSettings: (s: Settings) => req<Settings>('PUT', '/settings', s),
  aiModels: () => req<{ models: { id: string; name: string; provider: string }[] }>('GET', '/ai/models'),
  aiReview: (model: string, prompt: string) => req<{ answer: string; model: string }>('POST', '/ai/review', { model, prompt }),
  pushPublicKey: () => req<{ publicKey: string }>('GET', '/push/public-key'),
  pushSubscribe: (sub: PushSubscriptionJSON) => req<void>('POST', '/push/subscriptions', sub),
  pushUnsubscribe: (endpoint: string) => req<void>('DELETE', '/push/subscriptions', { endpoint }),
  pushTest: () => req<{ delivered: number }>('POST', '/push/test')
};
