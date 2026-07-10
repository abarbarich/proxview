import { generateKeyPairSync } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

/** Generate a WireGuard (Curve25519) keypair, base64-encoded like `wg genkey`. */
function wireguardKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pub = publicKey.export({ type: 'spki', format: 'der' });
  // The raw 32-byte key is the tail of the DER structure.
  return {
    privateKey: priv.subarray(priv.length - 32).toString('base64'),
    publicKey: pub.subarray(pub.length - 32).toString('base64'),
  };
}

export async function registerTools(app: FastifyInstance): Promise<void> {
  app.post('/api/tools/wireguard-keypair', async () => wireguardKeypair());
}
