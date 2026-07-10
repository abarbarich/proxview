import { randomBytes } from 'node:crypto';
import { getDb } from '../db/index.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
export const SESSION_COOKIE = 'pv_session';

export interface SessionUser {
  id: number;
  username: string;
}

export function createSession(userId: number): string {
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES(?, ?, ?, ?)')
    .run(id, userId, now, now + SESSION_TTL_MS);
  return id;
}

export function getSessionUser(sessionId: string | undefined): SessionUser | null {
  if (!sessionId) return null;
  const row = getDb()
    .prepare(
      `SELECT s.expires_at AS exp, u.id AS id, u.username AS username
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId) as { exp: number; id: number; username: string } | undefined;
  if (!row) return null;
  if (row.exp < Date.now()) {
    deleteSession(sessionId);
    return null;
  }
  return { id: row.id, username: row.username };
}

export function deleteSession(sessionId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function purgeExpiredSessions(): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
