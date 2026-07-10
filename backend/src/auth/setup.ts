import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { deleteSetting, getDb, getSetting, setSetting } from '../db/index.js';

const TOKEN_KEY = 'setup_token_hash';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function userCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function needsSetup(): boolean {
  return userCount() === 0;
}

/**
 * Mint a fresh one-time setup token and persist only its hash. Called on every boot
 * while unconfigured, so a restart always yields a working (and printable) token and
 * invalidates any previous one.
 */
export function regenerateSetupToken(): string {
  const token = randomBytes(9).toString('hex'); // 18 hex chars
  setSetting(TOKEN_KEY, sha256(token));
  return token;
}

export function verifySetupToken(token: string): boolean {
  const stored = getSetting(TOKEN_KEY);
  if (!stored) return false;
  const a = Buffer.from(sha256(token));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearSetupToken(): void {
  deleteSetting(TOKEN_KEY);
}
