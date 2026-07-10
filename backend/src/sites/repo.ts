import { decryptSecret, encryptSecret } from '../crypto/secretbox.js';
import { getDb } from '../db/index.js';
import type { PbsConfig } from '../monitoring/pbs.js';
import type { PveConfig } from '../monitoring/pve.js';

export interface SiteInput {
  name: string;
  kind: 'pve' | 'pbs';
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsVerify: boolean;
  sshHost?: string | null;
  sshUser?: string | null;
  sshPort?: number | null;
  sshKey?: string | null;
}

/** Site as returned to the client — never includes decrypted secrets. */
export interface SitePublic {
  id: number;
  name: string;
  kind: 'pve' | 'pbs';
  baseUrl: string;
  tokenId: string;
  tlsVerify: boolean;
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  hasSshKey: boolean;
  enabled: boolean;
}

interface SiteRow {
  id: number;
  name: string;
  kind: 'pve' | 'pbs';
  base_url: string;
  token_id: string;
  token_secret_enc: string;
  tls_verify: number;
  ssh_host: string | null;
  ssh_user: string | null;
  ssh_port: number | null;
  ssh_key_enc: string | null;
  enabled: number;
  created_at: number;
}

function toPublic(r: SiteRow): SitePublic {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    baseUrl: r.base_url,
    tokenId: r.token_id,
    tlsVerify: r.tls_verify === 1,
    sshHost: r.ssh_host,
    sshUser: r.ssh_user,
    sshPort: r.ssh_port,
    hasSshKey: r.ssh_key_enc != null,
    enabled: r.enabled === 1,
  };
}

export function listSites(): SitePublic[] {
  const rows = getDb().prepare('SELECT * FROM sites ORDER BY name').all() as SiteRow[];
  return rows.map(toPublic);
}

export function getSiteRow(id: number): SiteRow | undefined {
  return getDb().prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined;
}

export function createSite(input: SiteInput): SitePublic {
  const info = getDb()
    .prepare(
      `INSERT INTO sites
        (name, kind, base_url, token_id, token_secret_enc, tls_verify,
         ssh_host, ssh_user, ssh_port, ssh_key_enc, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.baseUrl,
      input.tokenId,
      encryptSecret(input.tokenSecret),
      input.tlsVerify ? 1 : 0,
      input.sshHost ?? null,
      input.sshUser ?? null,
      input.sshPort ?? null,
      input.sshKey ? encryptSecret(input.sshKey) : null,
      Date.now(),
    );
  return toPublic(getSiteRow(Number(info.lastInsertRowid))!);
}

export interface SiteUpdate {
  name: string;
  baseUrl: string;
  tokenId: string;
  tokenSecret?: string | null; // blank/absent → keep existing
  tlsVerify: boolean;
  sshHost?: string | null;
  sshUser?: string | null;
  sshPort?: number | null;
  sshKey?: string | null; // blank/absent → keep existing (unless SSH cleared)
}

/**
 * Update an existing site. Secrets are only re-encrypted when a new value is
 * supplied; clearing the SSH host disables temperature collection entirely.
 */
export function updateSite(id: number, patch: SiteUpdate): SitePublic | undefined {
  const existing = getSiteRow(id);
  if (!existing) return undefined;

  const tokenSecretEnc = patch.tokenSecret
    ? encryptSecret(patch.tokenSecret)
    : existing.token_secret_enc;

  const sshHost = patch.sshHost || null;
  let sshUser: string | null = null;
  let sshPort: number | null = null;
  let sshKeyEnc: string | null = null;
  if (sshHost) {
    sshUser = patch.sshUser || null;
    sshPort = patch.sshPort ?? null;
    sshKeyEnc = patch.sshKey ? encryptSecret(patch.sshKey) : existing.ssh_key_enc;
  }

  getDb()
    .prepare(
      `UPDATE sites SET name = ?, base_url = ?, token_id = ?, token_secret_enc = ?,
         tls_verify = ?, ssh_host = ?, ssh_user = ?, ssh_port = ?, ssh_key_enc = ?
       WHERE id = ?`,
    )
    .run(
      patch.name,
      patch.baseUrl,
      patch.tokenId,
      tokenSecretEnc,
      patch.tlsVerify ? 1 : 0,
      sshHost,
      sshUser,
      sshPort,
      sshKeyEnc,
      id,
    );
  return toPublic(getSiteRow(id)!);
}

export function deleteSite(id: number): boolean {
  return getDb().prepare('DELETE FROM sites WHERE id = ?').run(id).changes > 0;
}

export interface SiteSshTarget {
  kind: 'pve' | 'pbs';
  host: string;
  port: number;
  user: string;
  privateKey: string;
}

/** Decrypted SSH target for a site (for temp collection / unprovisioning). */
export function getSiteSshTarget(id: number): SiteSshTarget | undefined {
  const r = getSiteRow(id);
  if (!r || !r.ssh_host || !r.ssh_user || !r.ssh_key_enc) return undefined;
  return {
    kind: r.kind,
    host: r.ssh_host,
    port: r.ssh_port ?? 22,
    user: r.ssh_user,
    privateKey: decryptSecret(r.ssh_key_enc),
  };
}

/** Store SSH connection details + private key for temperature collection. */
export function setSiteSsh(
  id: number,
  host: string,
  user: string,
  port: number,
  privateKey: string,
): void {
  getDb()
    .prepare(
      'UPDATE sites SET ssh_host = ?, ssh_user = ?, ssh_port = ?, ssh_key_enc = ? WHERE id = ?',
    )
    .run(host, user, port, encryptSecret(privateKey), id);
}

export interface ExportSite {
  name: string;
  kind: 'pve' | 'pbs';
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsVerify: boolean;
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKey: string | null;
}

/** All sites with secrets DECRYPTED — for portable backup/migration. Sensitive. */
export function exportSites(): ExportSite[] {
  const rows = getDb().prepare('SELECT * FROM sites ORDER BY name').all() as SiteRow[];
  return rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    baseUrl: r.base_url,
    tokenId: r.token_id,
    tokenSecret: decryptSecret(r.token_secret_enc),
    tlsVerify: r.tls_verify === 1,
    sshHost: r.ssh_host,
    sshUser: r.ssh_user,
    sshPort: r.ssh_port,
    sshKey: r.ssh_key_enc ? decryptSecret(r.ssh_key_enc) : null,
  }));
}

export function clearSites(): void {
  getDb().prepare('DELETE FROM sites').run();
}

export interface ConnConfig {
  kind: 'pve' | 'pbs';
  siteId: string;
  name: string;
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  tlsVerify: boolean;
}

/** Decrypted connection config for a single site (used to re-test after edits). */
export function getConnConfig(id: number): ConnConfig | undefined {
  const r = getSiteRow(id);
  if (!r) return undefined;
  return {
    kind: r.kind,
    siteId: String(r.id),
    name: r.name,
    baseUrl: r.base_url,
    tokenId: r.token_id,
    tokenSecret: decryptSecret(r.token_secret_enc),
    tlsVerify: r.tls_verify === 1,
  };
}

export interface SshSiteTarget {
  siteId: string;
  host: string;
  port: number;
  user: string;
  privateKey: string;
}

/** Enabled sites (PVE or PBS) that have SSH configured — for temperature collection. */
export function listSshTargets(): SshSiteTarget[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM sites
        WHERE enabled = 1
          AND ssh_host IS NOT NULL AND ssh_user IS NOT NULL AND ssh_key_enc IS NOT NULL`,
    )
    .all() as SiteRow[];
  return rows.map((r) => ({
    siteId: String(r.id),
    host: r.ssh_host!,
    port: r.ssh_port ?? 22,
    user: r.ssh_user!,
    privateKey: decryptSecret(r.ssh_key_enc!),
  }));
}

/** Decrypted PVE configs for the poller (enabled PVE sites only). */
export function listPveConfigs(): PveConfig[] {
  const rows = getDb()
    .prepare("SELECT * FROM sites WHERE kind = 'pve' AND enabled = 1")
    .all() as SiteRow[];
  return rows.map((r) => ({
    siteId: String(r.id),
    name: r.name,
    baseUrl: r.base_url,
    tokenId: r.token_id,
    tokenSecret: decryptSecret(r.token_secret_enc),
    tlsVerify: r.tls_verify === 1,
  }));
}

/** Decrypted PBS configs for the poller (enabled PBS sites only). */
export function listPbsConfigs(): PbsConfig[] {
  const rows = getDb()
    .prepare("SELECT * FROM sites WHERE kind = 'pbs' AND enabled = 1")
    .all() as SiteRow[];
  return rows.map((r) => ({
    siteId: String(r.id),
    name: r.name,
    baseUrl: r.base_url,
    tokenId: r.token_id,
    tokenSecret: decryptSecret(r.token_secret_enc),
    tlsVerify: r.tls_verify === 1,
  }));
}
