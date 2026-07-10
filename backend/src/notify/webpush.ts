import webpush from 'web-push';
import { deletePushSubscription, getVapid, listPushSubscriptions } from './repo.js';
import type { NotifyMessage } from './types.js';

export async function sendWebPush(msg: NotifyMessage): Promise<void> {
  const vapid = getVapid();
  if (!vapid) throw new Error('web push not initialised');
  webpush.setVapidDetails('mailto:proxview@localhost', vapid.publicKey, vapid.privateKey);

  const subs = listPushSubscriptions();
  if (subs.length === 0) throw new Error('no browser subscriptions — enable notifications first');

  const payload = JSON.stringify({ title: msg.title, body: msg.body, level: msg.level });
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          s.sub as webpush.PushSubscription,
          payload,
        );
        delivered += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) deletePushSubscription(s.endpoint); // gone
      }
    }),
  );
  if (delivered === 0) throw new Error('all push deliveries failed');
}
