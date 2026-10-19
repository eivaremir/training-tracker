<script lang="ts">
  // Floating rest countdown, shown on every page by the app layout while $lib/rest has an active rest.
  // Remaining time is always (saved end time − now), re-read on a short tick and whenever the app
  // returns to the foreground, so backgrounding can't freeze it. Beeps each of the last 10 seconds
  // and plays a final tone at 0. Tapping the time opens the routine it belongs to.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Label from './Label.svelte';
  import { rest } from '../rest.svelte';
  import { store } from '../store.svelte';
  import { beep, unlockAudio } from '../beep';

  let now = $state(Date.now());
  const a = $derived(rest.active);
  const left = $derived(rest.leftMs(now));
  const remaining = $derived(Math.max(0, Math.ceil(left / 1000)));
  const paused = $derived(a?.pausedMs != null);
  const pct = $derived(a?.total ? Math.min(1, Math.max(0, left / (a.total * 1000))) : 0);
  const mm = $derived(String(Math.floor(remaining / 60)).padStart(2, '0'));
  const ss = $derived(String(remaining % 60).padStart(2, '0'));
  const href = $derived(a ? `/today?plan=${encodeURIComponent(a.planId)}&routine=${encodeURIComponent(a.routineId)}` : '/today');

  // Finishing the session ends its rest too.
  $effect(() => {
    if (a && store.sessions.find((s) => s.id === a.sessionId)?.endedAt) rest.stop();
  });

  let beeped = ''; // "startedAt:second" of the last beep, so no second beeps twice

  function tick() {
    now = Date.now();
    const r = rest.active;
    if (!r) return;
    const ms = rest.leftMs(now);
    const sec = Math.max(0, Math.ceil(ms / 1000));
    // Only beep right after a second starts: seconds that went by while the app was suspended
    // stay silent instead of firing in a burst on return.
    const key = `${r.startedAt}:${sec}`;
    if (sec <= 10 && r.pausedMs == null && key !== beeped && sec * 1000 - ms < 500) {
      beeped = key;
      beep(sec === 0);
    }
    if (ms <= 0) rest.stop();
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

<div class="timer" class:paused role="timer" aria-live="off">
  <a class="face" {href} aria-label="{paused ? 'Rest paused' : 'Rest'} {mm}:{ss}. Open routine">
    <svg class="ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle class="track" cx="20" cy="20" r="17" />
      <circle class="fill" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="{pct * 100} 100" />
    </svg>
    <span class="txt">
      <Label size={8}>{paused ? 'Paused' : 'Rest'}</Label>
      <span class="time">{mm}:{ss}</span>
    </span>
  </a>
  <button class="pause" onclick={togglePause} aria-label={paused ? 'Resume rest' : 'Pause rest'}><Icon name={paused ? 'play' : 'pause'} size={15} /></button>
  <button class="skip" onclick={() => rest.stop()} aria-label="Skip rest"><Icon name="x" size={15} /></button>
</div>

<style>
  /* Floats above the bottom tab bar on phones, bottom-right beside the rail/sidebar on wider screens.
     z-index stays under the nav's open menu (55) and sheets (100). */
  .timer { position: fixed; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 50;
    display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 8px; border-radius: 34px;
    background: var(--surface-hi); border: 1px solid var(--border-hi); box-shadow: var(--shadow);
    animation: rest-in 0.18s ease-out; }
  @media (min-width: 720px) {
    .timer { right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
  }
  @keyframes rest-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } }

  .face { display: flex; align-items: center; gap: 10px; padding-right: 6px; color: inherit; text-decoration: none; }
  .ring { width: 40px; height: 40px; transform: rotate(-90deg); flex-shrink: 0; }
  .ring circle { fill: none; stroke-width: 4; }
  .ring .track { stroke: var(--border); }
  .ring .fill { stroke: var(--text); stroke-linecap: round; transition: stroke-dasharray 0.25s linear; }
  .paused .ring .fill { stroke: var(--text-low); }
  .txt { display: flex; flex-direction: column; gap: 2px; }
  .time { font-family: var(--f-cond); font-weight: 700; font-size: 26px; color: var(--text); letter-spacing: 0.5px;
    font-variant-numeric: tabular-nums; line-height: 1; }

  button { width: 38px; height: 38px; border-radius: 19px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .pause { background: transparent; border: 1px solid var(--border-hi); color: var(--text); }
  .skip { background: var(--text); border: none; color: var(--bg); }
</style>
