import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REMINDERS = 400;

const keyFor = (endpoint) => createHash('sha256').update(endpoint).digest('hex');
const str = (value, max) => String(value ?? '').slice(0, max);

/**
 * Stores a device's push subscription and its upcoming reminders (time, title,
 * body). Nothing else about the user is sent or kept. DELETE removes it all.
 */
export default async (req) => {
  const store = getStore('push-subscriptions');

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response('Method not allowed', { status: 405 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return new Response('Too large', { status: 413 });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const sub = body?.subscription;
  if (
    typeof sub?.endpoint !== 'string' ||
    !sub.endpoint.startsWith('https://') ||
    typeof sub.keys?.p256dh !== 'string' ||
    typeof sub.keys?.auth !== 'string'
  ) {
    return new Response('Invalid subscription', { status: 400 });
  }
  const key = keyFor(sub.endpoint);

  if (req.method === 'DELETE') {
    await store.delete(key);
    return Response.json({ ok: true });
  }

  const now = Date.now();
  const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
    .filter((r) => Number.isFinite(r?.at) && r.at > now - 5 * 60 * 1000)
    .slice(0, MAX_REMINDERS)
    .map((r) => ({
      at: Math.round(r.at),
      title: str(r.title, 80),
      body: str(r.body, 200),
      tag: str(r.tag, 80),
    }));

  await store.setJSON(key, {
    subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    reminders,
    updatedAt: now,
  });
  return Response.json({ ok: true, count: reminders.length });
};

export const config = { path: '/api/push-sync' };
