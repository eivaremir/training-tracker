// Session state. The token is a JWT from POST /auth/login, kept in localStorage and sent as a Bearer header.
import { goto } from '$app/navigation';
import { api, apiEnabled, configureAuth, type PublicUser } from './api';
import { store } from './store.svelte';

const KEY = 'tt-auth';

interface Session { token: string; expiresAt: number; user: PublicUser }

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null;
    return s && s.expiresAt * 1000 > Date.now() ? s : null;
  } catch {
    return null;
  }
}

class Auth {
  session = $state<Session | null>(read());

  get user() { return this.session?.user ?? null; }

  /** Offline demo mode has no backend to authenticate against, so it is always "signed in". */
  get isAuthenticated() {
    return !apiEnabled || (!!this.session && this.session.expiresAt * 1000 > Date.now());
  }

  async login(email: string, password: string) {
    const res = await api.login(email, password);
    this.session = { token: res.token, expiresAt: res.expiresAt, user: res.user };
    try { localStorage.setItem(KEY, JSON.stringify(this.session)); } catch { /* private mode: session lasts for this tab */ }
  }

  logout() {
    this.session = null;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    store.reset();
  }
}

export const auth = new Auth();

/** Only same-app paths are allowed as post-login targets (no open redirects). */
export const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

configureAuth({
  token: () => auth.session?.token ?? null,
  onUnauthorized: () => {
    if (!auth.session) return;
    const next = location.pathname + location.search;
    auth.logout();
    goto(`/login?next=${encodeURIComponent(next)}&expired=1`);
  }
});
