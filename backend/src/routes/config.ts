import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearSites, createSite, exportSites } from '../sites/repo.js';

const importSchema = z.object({
  replace: z.boolean().optional(),
  sites: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(['pve', 'pbs']),
        baseUrl: z.string().min(1),
        tokenId: z.string().min(1),
        tokenSecret: z.string().min(1),
        tlsVerify: z.boolean().optional(),
        sshHost: z.string().nullable().optional(),
        sshUser: z.string().nullable().optional(),
        sshPort: z.number().nullable().optional(),
        sshKey: z.string().nullable().optional(),
      }),
    )
    .max(200),
});

export async function registerConfig(app: FastifyInstance): Promise<void> {
  // Portable backup — contains DECRYPTED credentials; keep the file safe.
  app.get('/api/config/export', async (_req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="proxview-config.json"');
    return { version: 1, kind: 'proxview-config', sites: exportSites() };
  });

  app.post('/api/config/import', async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const { replace, sites } = parsed.data;
    if (replace) clearSites();
    for (const s of sites) {
      createSite({
        name: s.name,
        kind: s.kind,
        baseUrl: s.baseUrl,
        tokenId: s.tokenId,
        tokenSecret: s.tokenSecret,
        tlsVerify: s.tlsVerify ?? false,
        sshHost: s.sshHost ?? null,
        sshUser: s.sshUser ?? null,
        sshPort: s.sshPort ?? null,
        sshKey: s.sshKey ?? null,
      });
    }
    return { ok: true, imported: sites.length };
  });
}
