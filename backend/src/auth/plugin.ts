import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { cookieSecret } from '../crypto/secretbox.js';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  createSession,
  deleteSession,
  getSessionUser,
  purgeExpiredSessions,
  SESSION_COOKIE,
  type SessionUser,
} from './sessions.js';
import { clearSetupToken, needsSetup, verifySetupToken } from './setup.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

const credsSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

const setupSchema = z.object({
  token: z.string().trim().min(1),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(200),
});

/** Endpoints reachable without a session. Everything else under /api requires auth. */
const PUBLIC_PATHS = new Set<string>([
  '/api/health',
  '/api/setup',
  '/api/setup/status',
  '/api/auth/login',
]);

// A fixed hash to verify against on unknown usernames, equalising login timing.
let dummyHash: string | undefined;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword('proxview-nonexistent-user');
  return dummyHash;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie, { secret: cookieSecret() });

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 60 * 60 * 24 * 14,
    signed: true,
  };

  function setSessionCookie(reply: FastifyReply, sid: string): void {
    reply.setCookie(SESSION_COOKIE, sid, cookieOpts);
  }

  function readSessionId(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const unsigned = app.unsignCookie(raw);
    return unsigned.valid && unsigned.value ? unsigned.value : undefined;
  }

  // Guard: gate every non-public /api route on a valid session.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return;
    const path = req.url.split('?')[0]!;
    if (PUBLIC_PATHS.has(path)) return;
    const user = getSessionUser(readSessionId(req.cookies[SESSION_COOKIE]));
    if (!user) {
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
    req.user = user;
  });

  // --- first-run setup -----------------------------------------------------
  app.get('/api/setup/status', async () => ({ needsSetup: needsSetup() }));

  app.post('/api/setup', async (req, reply) => {
    if (!needsSetup()) return reply.code(409).send({ error: 'already_configured' });
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const { token, username, password } = parsed.data;
    if (!verifySetupToken(token)) return reply.code(403).send({ error: 'invalid_token' });

    const hash = await hashPassword(password);
    const info = getDb()
      .prepare('INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)')
      .run(username, hash, Date.now());
    clearSetupToken();
    const userId = Number(info.lastInsertRowid);
    setSessionCookie(reply, createSession(userId));
    return { ok: true, user: { id: userId, username } };
  });

  // --- login / logout / me -------------------------------------------------
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { username, password } = parsed.data;

    const row = getDb()
      .prepare('SELECT id, password_hash FROM users WHERE username = ?')
      .get(username) as { id: number; password_hash: string } | undefined;

    if (!row) {
      await verifyPassword(await getDummyHash(), password); // constant-ish timing
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    if (!(await verifyPassword(row.password_hash, password))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    purgeExpiredSessions();
    setSessionCookie(reply, createSession(row.id));
    return { ok: true, user: { id: row.id, username } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = readSessionId(req.cookies[SESSION_COOKIE]);
    if (sid) deleteSession(sid);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ user: req.user }));
}
