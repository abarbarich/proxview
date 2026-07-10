import { request } from 'undici';
import type { NotifyMessage, SlackConfig } from './types.js';

export async function sendSlack(cfg: SlackConfig, msg: NotifyMessage): Promise<void> {
  const icon = msg.level === 'crit' ? ':red_circle:' : msg.level === 'warn' ? ':large_yellow_circle:' : ':white_check_mark:';
  const res = await request(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `${icon} *${msg.title}*\n${msg.body}` }),
    headersTimeout: 9000,
    bodyTimeout: 9000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`slack ${res.statusCode}: ${text.slice(0, 160)}`);
}
