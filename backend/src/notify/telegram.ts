import { request } from 'undici';
import type { NotifyMessage, TelegramConfig } from './types.js';

export async function sendTelegram(cfg: TelegramConfig, msg: NotifyMessage): Promise<void> {
  const icon = msg.level === 'crit' ? '🔴' : msg.level === 'warn' ? '🟡' : '✅';
  const res = await request(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text: `${icon} ${msg.title}\n${msg.body}` }),
    headersTimeout: 9000,
    bodyTimeout: 9000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`telegram ${res.statusCode}: ${text.slice(0, 160)}`);
}
