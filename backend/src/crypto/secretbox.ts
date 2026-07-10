import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../config/env.js';

let key: Buffer | undefined;

/**
 * Resolve the 32-byte master key used to encrypt stored site credentials.
 * Preference: PROXVIEW_SECRET_KEY env (64 hex) → ./data/secret.key (auto-generated).
 * Losing this key means every stored API token must be re-entered.
 */
export function initSecretKey(): void {
  const fromEnv = process.env.PROXVIEW_SECRET_KEY?.trim();
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      throw new Error(
        'PROXVIEW_SECRET_KEY must be 64 hex chars (32 bytes). Generate one with: openssl rand -hex 32',
      );
    }
    key = Buffer.from(fromEnv, 'hex');
    return;
  }

  mkdirSync(env.dataDir, { recursive: true });
  const keyPath = join(env.dataDir, 'secret.key');
  if (existsSync(keyPath)) {
    key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex');
  } else {
    key = randomBytes(32);
    writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      /* best-effort on non-POSIX filesystems */
    }
  }
}

function getKey(): Buffer {
  if (!key) throw new Error('Secret key not initialised — call initSecretKey() first');
  return key;
}

/** Encrypt a UTF-8 string → base64(iv[12] || tag[16] || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Stable cookie-signing secret derived from the master key (domain-separated). */
export function cookieSecret(): string {
  return createHash('sha256')
    .update(Buffer.concat([getKey(), Buffer.from('proxview:cookie')]))
    .digest('hex');
}
