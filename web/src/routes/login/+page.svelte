<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Label from '$lib/components/Label.svelte';
  import Button from '$lib/components/Button.svelte';
  import TextField from '$lib/components/TextField.svelte';
  import BlaiseMark from '$lib/components/BlaiseMark.svelte';
  import { ApiError } from '$lib/api';
  import { auth, safeNext } from '$lib/auth.svelte';
  import { store } from '$lib/store.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  const expired = page.url.searchParams.has('expired');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await auth.login(email, password);
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } catch (err) {
      error = err instanceof ApiError
        ? err.status === 429 ? 'Too many failed attempts. Try again in 15 minutes.' : 'Invalid email or password.'
        : "Can't reach the server. Check your connection and try again.";
      password = '';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign in · Training Tracker</title></svelte:head>

<div class="login">
  <div class="hero">
    <div class="theme"><IconButton icon={store.theme === 'dark' ? 'sun' : 'moon'} onclick={() => store.toggleTheme()} label="Toggle theme" /></div>
    <div class="mark"><Icon name="dumbbell" size={30} /></div>
    <Label size={10}>[ Training Tracker ]</Label>
  </div>

  <div class="body">
    <div class="intro">
      <Label size={9} color={expired ? 'var(--danger)' : 'var(--text-low)'}>{expired ? 'Session expired' : 'Welcome back'}</Label>
      <h1>Sign in</h1>
      <p>Log sets, hit your goals, watch the numbers move.</p>
    </div>

    <form onsubmit={submit} novalidate>
      <TextField label="Email" type="email" name="email" bind:value={email} placeholder="you@example.com"
        autocomplete="username" autocapitalize="none" spellcheck={false} required />
      <TextField label="Password" type="password" name="password" bind:value={password} placeholder="••••••••"
        autocomplete="current-password" required />

      {#if error}
        <div class="err" role="alert"><Icon name="lock" size={14} /><span>{error}</span></div>
      {/if}

      <Button type="submit" full size="lg" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  </div>

  <div class="foot">
    <div class="secure"><Icon name="lock" size={11} /><Label size={9} color="var(--text-low)">Secure session · 7 days</Label></div>
    <a class="byline" href="https://www.blaisetechnology.com" target="_blank" rel="noopener noreferrer">
      <BlaiseMark size={13} />
      <strong>BLAISE TECHNOLOGY LLC</strong>
    </a>
  </div>
</div>

<style>
  .login { min-height: 100vh; display: flex; flex-direction: column; }
  .hero { position: relative; height: calc(220px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
    background: repeating-linear-gradient(45deg, var(--stripe-a) 0 10px, var(--stripe-b) 10px 20px); border-bottom: 1px solid var(--border); }
  .theme { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; }
  .mark { width: 64px; height: 64px; border-radius: 16px; background: var(--text); color: var(--bg); display: flex; align-items: center; justify-content: center; }
  .body { flex: 1; padding: 28px 20px; display: flex; flex-direction: column; gap: 28px; }
  .intro { display: flex; flex-direction: column; gap: 6px; }
  h1 { margin: 0; font-family: var(--f-cond); font-weight: 700; font-size: 44px; line-height: 0.95; letter-spacing: 0.5px; text-transform: uppercase; }
  p { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); }
  form { display: flex; flex-direction: column; gap: 16px; }
  .err { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--danger); border-radius: 10px;
    color: var(--danger); font-family: var(--f-sans); font-size: 13px; }
  .foot { padding: 14px 20px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: center; gap: 10px;
    color: var(--text-low); border-top: 1px solid var(--border); }
  .secure { display: flex; align-items: center; gap: 6px; }
  .byline { display: inline-flex; align-items: center; gap: 6px; color: var(--text-low); text-decoration: none;
    font-family: var(--f-mono); font-size: 9px; letter-spacing: 1px; text-transform: uppercase; transition: color 0.15s; }
  .byline strong { font-weight: 500; color: var(--text-mid); transition: color 0.15s; }
  .byline:hover, .byline:hover strong { color: var(--text); }
</style>
