<script module lang="ts">
  import { rest, type RestOwner } from '../rest.svelte';
  import { beep, unlockAudio } from '../beep';
  import type { Session } from '../types';

  /** Start a rest. Call it from the set-logging tap so the countdown's beeps are allowed to play. */
  export function startRest(seconds: number, owner: RestOwner) {
    unlockAudio();
    rest.start(seconds, owner);
  }

  /** Seconds of the active rest if it belongs to this (unfinished) session, e.g. after a reload; else null. */
  export function restFor(session: Session | undefined) {
    return session && !session.endedAt && rest.active?.sessionId === session.id ? rest.active.total : null;
  }
</script>

<script lang="ts">
  // Rest countdown for the active rest in $lib/rest. Remaining time is always (saved end time − now),
  // re-read on a short tick and whenever the app returns to the foreground, so backgrounding can't
  // freeze it. Beeps each of the last 10 seconds and plays a final tone at 0.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';

  let { ondone }: { ondone: () => void } = $props();

  let now = $state(Date.now());
  const left = $derived(rest.leftMs(now));
  const remaining = $derived(Math.max(0, Math.ceil(left / 1000)));
  const total = $derived(rest.active?.total ?? 0);
  const paused = $derived(rest.active?.pausedMs != null);
  const pct = $derived(total ? Math.min(1, Math.max(0, left / (total * 1000))) : 0);
  const mm = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
  const ss = $derived(String(remaining % 60).padStart(2, '0'));

  let beeped = ''; // "startedAt:second" of the last beep, so no second beeps twice

  function tick() {
    now = Date.now();
    const a = rest.active;
    if (!a) return;
    const ms = rest.leftMs(now);
    const sec = Math.max(0, Math.ceil(ms / 1000));
    // Only beep right after a second starts: seconds that went by while the app was suspended
    // stay silent instead of firing in a burst on return.
    const key = `${a.startedAt}:${sec}`;
    if (sec <= 10 && a.pausedMs == null && key !== beeped && sec * 1000 - ms < 500) {
      beeped = key;
      beep(sec === 0);
    }
    if (ms <= 0) finish();
  }

  function finish() {
    rest.stop();
    ondone();
  }

  function togglePause() {
    unlockAudio();
    if (paused) rest.resume();
    else rest.pause();
    tick();
  }

  onMount(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const loop = () => {
      clearTimeout(t);
      tick();
      // Wake just after the next second boundary (at least every 250 ms) so digits and beeps land on time.
      t = setTimeout(loop, Math.min(250, Math.max(0, rest.leftMs() % 1000) + 15));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') loop(); };
    loop();
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('focus', loop);
    addEventListener('pageshow', loop);
    // Any tap while resting also unlocks audio, e.g. when a reload restored the timer.
    addEventListener('pointerup', unlockAudio, true);
    addEventListener('keydown', unlockAudio, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('focus', loop);
      removeEventListener('pageshow', loop);
      removeEventListener('pointerup', unlockAudio, true);
      removeEventListener('keydown', unlockAudio, true);
    };
  });
</script>

<div class="timer">
  <div class="bar"><div style:height="{pct * 100}%"></div></div>
  <div class="mid">
    <Label>{paused ? 'Paused' : 'Rest'}</Label>
    <div class="time">{mm}:{ss}</div>
  </div>
  <button class="pause" onclick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}><Icon name={paused ? 'play' : 'pause'} size={16} /></button>
  <button class="skip" onclick={finish} aria-label="Skip rest"><Icon name="x" size={16} /></button>
</div>

<style>
  @media (min-width: 720px) {
    .timer { left: auto !important; right: 16px !important; bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important; width: 420px; }
  }
  .timer { position: fixed; left: 12px; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 50; max-width: 456px; margin: 0 auto;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: 14px; padding: 14px 16px;
    display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow); }
  .bar { width: 4px; height: 44px; background: var(--border); border-radius: 2px; position: relative; overflow: hidden; }
  .bar div { position: absolute; bottom: 0; left: 0; right: 0; background: var(--text); transition: height 0.25s linear; }
  .mid { flex: 1; }
  .time { font-family: var(--f-cond); font-weight: 700; font-size: 32px; color: var(--text); letter-spacing: 0.5px; font-variant-numeric: tabular-nums; line-height: 1; }
  button { width: 40px; height: 40px; border-radius: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .pause { background: transparent; border: 1px solid var(--border-hi); color: var(--text); }
  .skip { background: var(--text); border: none; color: var(--bg); }
</style>
