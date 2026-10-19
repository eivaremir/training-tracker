// Rest-timer beeps synthesized with Web Audio (no audio files). Browsers don't prompt for audio, they
// just keep it muted until a user gesture, so unlockAudio() must run inside a tap (logging a set,
// the timer's buttons); beep() is silent until then.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/** Create/resume the shared AudioContext. Call from a user gesture handler. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    // iOS only lets a context make sound after something actually starts inside the gesture.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* no Web Audio */ }
}

/** Short tick for the countdown; `final` is the longer, higher tone when rest is over. */
export function beep(final = false) {
  try { navigator.vibrate?.(final ? [180, 80, 180] : 30); } catch { /* unsupported */ }
  if (!ctx) return;
  try {
    // iOS suspends ("interrupts") the context in the background; resuming outside a gesture may not work.
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const dur = final ? 0.6 : 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = final ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* context closed */ }
}
