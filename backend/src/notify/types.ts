export type ChannelType = 'email' | 'telegram' | 'slack' | 'webpush';

export interface NotifyMessage {
  title: string;
  body: string;
  level: 'info' | 'warn' | 'crit';
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface SlackConfig {
  webhookUrl: string;
}
