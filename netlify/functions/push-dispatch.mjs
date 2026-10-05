import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

const STALE_AFTER_MS = 10 * 60 * 1000; // don't send reminders that are long overdue
const UNUSED_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // forget devices that never came back

/** Runs every minute and pushes the reminders that have come due. */
export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('VAPID keys are not configured; skipping');
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:noreply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const store = getStore('push-subscriptions');
  const now = Date.now();
  const { blobs } = await store.list();

  for (const { key } of blobs) {
    const entry = await store.get(key, { type: 'json' });
    if (!entry) continue;

    if (now - entry.updatedAt > UNUSED_AFTER_MS) {
      await store.delete(key);
      continue;
    }

    const due = entry.reminders.filter((r) => r.at <= now && r.at > now - STALE_AFTER_MS);
    const remaining = entry.reminders.filter((r) => r.at > now);
    if (due.length === 0 && remaining.length === entry.reminders.length) continue;

    let gone = false;
    for (const r of due) {
      try {
        await webpush.sendNotification(
          entry.subscription,
          JSON.stringify({ title: r.title, body: r.body, tag: r.tag }),
          { TTL: 300, urgency: 'high' }
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          gone = true; // the user uninstalled the app or revoked permission
          break;
        }
        console.error('Push failed', error.statusCode, error.body);
      }
    }

    if (gone) await store.delete(key);
    else await store.setJSON(key, { ...entry, reminders: remaining });
  }
};

export const config = { schedule: '* * * * *' };
