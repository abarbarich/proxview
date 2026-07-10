import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from './passwords.js';

export interface UserPublic {
  id: number;
  username: string;
  createdAt: number;
}

export function listUsers(): UserPublic[] {
  const rows = getDb()
    .prepare('SELECT id, username, created_at FROM users ORDER BY id')
    .all() as Array<{ id: number; username: string; created_at: number }>;
  return rows.map((r) => ({ id: r.id, username: r.username, createdAt: r.created_at }));
}

export function usernameExists(username: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM users WHERE username = ?').get(username);
}

export function userTotal(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export async function createUser(username: string, password: string): Promise<UserPublic> {
  const hash = await hashPassword(password);
  const info = getDb()
    .prepare('INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)')
    .run(username, hash, Date.now());
  return { id: Number(info.lastInsertRowid), username, createdAt: Date.now() };
}

export function deleteUser(id: number): boolean {
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

/** Verify the current password, then set a new one. Returns false if current is wrong. */
export async function changePassword(
  userId: number,
  current: string,
  next: string,
): Promise<boolean> {
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row) return false;
  if (!(await verifyPassword(row.password_hash, current))) return false;
  const hash = await hashPassword(next);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return true;
}
