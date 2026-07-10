import nodemailer from 'nodemailer';
import type { EmailConfig, NotifyMessage } from './types.js';

export async function sendEmail(cfg: EmailConfig, msg: NotifyMessage): Promise<void> {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transport.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: `[ProxView] ${msg.title}`,
    text: msg.body,
  });
}
