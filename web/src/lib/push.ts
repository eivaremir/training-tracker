// Web Push: permission, subscription and server registration for routine reminders.
import { api } from './api';

export type PushStatus = 'unsupported' | 'needs-install' | 'default' | 'denied' | 'granted';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function pushStatus(): PushStatus {
  if (typeof window === 'undefined') return 'unsupported';
  // iOS only allows web push for apps added to the Home Screen (iOS 16.4+).
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushStatus;
}

const toBytes = (b64url: string) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** Asks permission (must run from a user gesture), subscribes this device and registers it. */
export async function enablePush(): Promise<PushStatus> {
  const status = pushStatus();
  if (status === 'unsupported' || status === 'needs-install') return status;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as PushStatus;

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.pushPublicKey();
  const key = toBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key can't be reused.
  const existing = sub?.options.applicationServerKey;
  if (sub && existing && new Uint8Array(existing).toString() !== key.toString()) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.pushSubscribe(sub.toJSON());
  return 'granted';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

export const sendTestPush = () => api.pushTest();
