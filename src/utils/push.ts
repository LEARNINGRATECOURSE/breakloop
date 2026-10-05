/**
 * Background reminders via Web Push, so break and task reminders arrive even
 * when BreakLoop is closed. Needs the small push service in netlify/functions:
 * it keeps only this device's push address and the upcoming reminder
 * times/texts, and is opt-in from Settings.
 */

export interface PushReminder {
  at: number; // timestamp
  title: string;
  body: string;
  tag: string;
}

export type PushResult = { ok: true } | { ok: false; reason: string };

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS only allows web push for apps added to the Home Screen. */
export function needsHomeScreenInstall(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD) return null; // the service worker only exists in production builds
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

async function post(method: 'POST' | 'DELETE', body: unknown): Promise<boolean> {
  try {
    const res = await fetch('/api/push-sync', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ask for permission, subscribe this device and register it with the push service. */
export async function enablePush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: "This browser doesn't support background notifications." };
  }
  if (needsHomeScreenInstall()) {
    return {
      ok: false,
      reason: 'On iPhone/iPad, first add BreakLoop to your Home Screen (Share → Add to Home Screen), then open it from there.',
    };
  }

  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notifications are blocked. Allow them in your browser or phone settings.' };
  }

  const registration = await getRegistration();
  if (!registration) {
    return { ok: false, reason: 'Background reminders only work in the installed or deployed app.' };
  }

  let publicKey: string | null = null;
  try {
    publicKey = (await (await fetch('/api/push-config')).json()).publicKey;
  } catch {
    /* handled below */
  }
  if (!publicKey) {
    return { ok: false, reason: "The reminder service isn't reachable right now." };
  }

  try {
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    const ok = await post('POST', { subscription: subscription.toJSON(), reminders: [] });
    return ok ? { ok: true } : { ok: false, reason: "The reminder service isn't reachable right now." };
  } catch (error) {
    console.error('Push subscribe failed:', error);
    return { ok: false, reason: "Couldn't turn on background reminders on this device." };
  }
}

/** Forget this device on the server and unsubscribe. */
export async function disablePush(): Promise<void> {
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await post('DELETE', { subscription: subscription.toJSON() });
  await subscription.unsubscribe();
}

/** Replace this device's upcoming reminders on the server. No-op if not subscribed. */
export async function syncReminders(reminders: PushReminder[]): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  return post('POST', { subscription: subscription.toJSON(), reminders });
}
