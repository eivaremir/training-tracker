// The active rest between sets. It's stored as an end timestamp rather than a ticking counter, so
// time keeps passing while the PWA is backgrounded (iOS suspends timers), and it's persisted to
// localStorage so a reload or a killed app picks it back up.

const LS_KEY = 'tt-rest-v1';

export type RestOwner = { planId: string; routineId: string; sessionId: string };
export type ActiveRest = RestOwner & {
  total: number; // seconds
  startedAt: number; // epoch ms; identifies this rest across pause/resume
  endsAt: number; // epoch ms; ignored while paused
  pausedMs: number | null; // remaining ms while paused
};

function load(): ActiveRest | null {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as ActiveRest | null;
    if (r && typeof r.endsAt === 'number' && (r.pausedMs != null || r.endsAt > Date.now())) return r;
    localStorage.removeItem(LS_KEY); // finished while the app was closed
  } catch { /* private mode / bad JSON */ }
  return null;
}

class Rest {
  active = $state<ActiveRest | null>(load());

  start(seconds: number, owner: RestOwner) {
    const now = Date.now();
    this.set({ ...owner, total: seconds, startedAt: now, endsAt: now + seconds * 1000, pausedMs: null });
  }
  pause() {
    const a = this.active;
    if (a && a.pausedMs == null) this.set({ ...a, pausedMs: Math.max(0, a.endsAt - Date.now()) });
  }
  resume() {
    const a = this.active;
    if (a && a.pausedMs != null) this.set({ ...a, endsAt: Date.now() + a.pausedMs, pausedMs: null });
  }
  stop() { this.set(null); }

  /** Milliseconds left at `now`; negative once it's over (0 when there's no rest). */
  leftMs(now = Date.now()) {
    const a = this.active;
    return !a ? 0 : (a.pausedMs ?? a.endsAt - now);
  }

  private set(r: ActiveRest | null) {
    this.active = r;
    try {
      if (r) localStorage.setItem(LS_KEY, JSON.stringify(r));
      else localStorage.removeItem(LS_KEY);
    } catch { /* quota / private mode */ }
  }
}

export const rest = new Rest();
