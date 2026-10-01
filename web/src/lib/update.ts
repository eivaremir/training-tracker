// App updates: SvelteKit's version file plus the service worker.
import { updated } from '$app/state';
import { version } from '$app/environment';

/** When the running build was made (the build version is a timestamp). */
export const buildDate = () => {
  const n = Number(version);
  return Number.isFinite(n) && n > 1e12 ? new Date(n) : null;
};

/** Asks the server whether a newer build exists and lets the service worker fetch it. Returns true if one does. */
export async function checkForUpdate(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await reg?.update().catch(() => {});
  return updated.check().catch(() => false);
}
