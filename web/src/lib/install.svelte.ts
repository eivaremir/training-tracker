// "Install app": Chrome, Edge and Android hand us a prompt we can open from a button;
// iOS has no prompt, so Settings explains Share → Add to Home Screen instead.
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

// iPadOS reports itself as a Mac; touch support tells them apart.
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

let deferred: InstallPromptEvent | null = null;
export const install = $state({ canPrompt: false, installed: false });

/** Call once at startup: the browser fires its install event only once per page load. */
export function watchInstall() {
  install.installed = isStandalone();
  const early = (window as { __installPrompt?: InstallPromptEvent }).__installPrompt;
  if (early) { deferred = early; install.canPrompt = true; }
  addEventListener('beforeinstallprompt', (e) => { deferred = e as InstallPromptEvent; install.canPrompt = true; });
  addEventListener('appinstalled', () => { deferred = null; install.canPrompt = false; install.installed = true; });
}

/** Opens the browser's install dialog (must run from a click). Resolves true if the user installed. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; install.canPrompt = false; // a prompt event can only be used once
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}
