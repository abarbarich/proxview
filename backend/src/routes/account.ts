import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  changePassword,
  createUser,
  deleteUser,
  listUsers,
  userTotal,
  usernameExists,
} from '../auth/users.js';

const newUserSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(200),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function registerAccount(app: FastifyInstance): Promise<void> {
  app.get('/api/users', async () => ({ users: listUsers() }));

  app.post('/api/users', async (req, reply) => {
    const parsed = newUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    if (usernameExists(parsed.data.username)) {
      return reply.code(409).send({ error: 'username_taken' });
    }
    const user = await createUser(parsed.data.username, parsed.data.password);
    return { user };
  });

  app.delete('/api/users/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid_id' });
    if (id === req.user?.id) return reply.code(400).send({ error: 'cannot_delete_self' });
    if (userTotal() <= 1) return reply.code(400).send({ error: 'last_user' });
    if (!deleteUser(id)) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.post('/api/account/password', async (req, reply) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const ok = await changePassword(
      req.user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    if (!ok) return reply.code(400).send({ error: 'wrong_password' });
    return { ok: true };
  });
}
