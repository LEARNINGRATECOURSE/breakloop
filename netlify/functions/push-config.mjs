// Public VAPID key the browser needs to subscribe to push. Not a secret.
export default async () =>
  Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });

export const config = { path: '/api/push-config' };
