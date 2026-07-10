import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getConnectivity, setConnectivity } from '../connectivity/store.js';
import { applyConnectivity, connectivityStatus } from '../connectivity/manager.js';

const cloudflareBody = z.object({
  enabled: z.boolean(),
  // Optional so a user can toggle off/on without re-pasting the token.
  token: z.string().trim().optional(),
});

const tailscaleBody = z.object({
  enabled: z.boolean(),
  authKey: z.string().trim().optional(),
  funnel: z.boolean().optional(),
});

export async function registerConnectivity(app: FastifyInstance): Promise<void> {
  app.get('/api/connectivity', async () => connectivityStatus());

  app.post('/api/connectivity/cloudflare', async (req, reply) => {
    const parsed = cloudflareBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { enabled, token } = parsed.data;
    const cfg = getConnectivity();
    cfg.cloudflare.enabled = enabled;
    if (token) cfg.cloudflare.token = token;
    if (enabled && !cfg.cloudflare.token) {
      return reply.code(400).send({ error: 'token_required' });
    }
    setConnectivity(cfg);
    applyConnectivity();
    return connectivityStatus();
  });

  app.post('/api/connectivity/tailscale', async (req, reply) => {
    const parsed = tailscaleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { enabled, authKey, funnel } = parsed.data;
    const cfg = getConnectivity();
    cfg.tailscale.enabled = enabled;
    if (authKey) cfg.tailscale.authKey = authKey;
    if (typeof funnel === 'boolean') cfg.tailscale.funnel = funnel;
    if (enabled && !cfg.tailscale.authKey) {
      return reply.code(400).send({ error: 'authkey_required' });
    }
    setConnectivity(cfg);
    applyConnectivity();
    return connectivityStatus();
  });
}
