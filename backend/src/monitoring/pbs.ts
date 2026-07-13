import { Agent, request } from 'undici';
import type { PbsBackupGroup, PbsDatastore, PbsSnapshot, PbsTaskStatus } from './types.js';

export interface PbsConfig {
  siteId: string;
  name: string;
  baseUrl: string; // https://host:8007
  tokenId: string; // user@realm!tokenname
  tokenSecret: string;
  tlsVerify: boolean;
}

const agents = new Map<string, Agent>();
function agentFor(cfg: PbsConfig): Agent {
  const key = `${cfg.baseUrl}|${cfg.tlsVerify}`;
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: cfg.tlsVerify, timeout: 8000 } });
    agents.set(key, agent);
  }
  return agent;
}

async function pbsGet<T>(cfg: PbsConfig, path: string): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api2/json${path}`;
  const res = await request(url, {
    method: 'GET',
    // NOTE: PBS uses a COLON before the secret (PVE uses '='). Classic footgun.
    headers: { authorization: `PBSAPIToken=${cfg.tokenId}:${cfg.tokenSecret}` },
    dispatcher: agentFor(cfg),
    headersTimeout: 9000,
    bodyTimeout: 9000,
  });
  if (res.statusCode >= 400) {
    const text = await res.body.text().catch(() => '');
    throw new Error(`HTTP ${res.statusCode}${text ? ` — ${text.slice(0, 140)}` : ''}`);
  }
  const json = (await res.body.json()) as { data: T };
  return json.data;
}

interface RawUsage {
  store: string;
  used?: number;
  avail?: number;
  total?: number;
  'estimated-full-date'?: number;
}
interface RawGroup {
  'backup-type'?: string;
  'backup-id'?: string;
  'last-backup'?: number;
  'backup-count'?: number;
}
interface RawHost {
  cpu?: number;
  cpuinfo?: { cpus?: number; model?: string };
  kversion?: string;
  memory?: { used?: number; total?: number };
  uptime?: number;
}
interface RawTask {
  worker_type?: string;
  type?: string;
  status?: string;
  endtime?: number;
  starttime?: number;
}

export async function testPbs(cfg: PbsConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const usage = await pbsGet<RawUsage[]>(cfg, '/status/datastore-usage');
    return { ok: true, message: `Connected — ${usage.length} datastore(s)` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

function latestTask(tasks: RawTask[], match: RegExp): PbsTaskStatus | undefined {
  const found = tasks
    .filter((t) => match.test(t.worker_type ?? t.type ?? ''))
    .sort((a, b) => (b.endtime ?? b.starttime ?? 0) - (a.endtime ?? a.starttime ?? 0))[0];
  if (!found) return undefined;
  const status: PbsTaskStatus['status'] = !found.endtime
    ? 'running'
    : found.status === 'OK'
      ? 'ok'
      : found.status
        ? 'failed'
        : 'unknown';
  return { status, time: found.endtime ?? found.starttime };
}

function usageToDatastore(u: RawUsage): PbsDatastore {
  const used = u.used ?? 0;
  const avail = u.avail ?? 0;
  const total = used + avail || u.total || 0;
  const denom = used + avail || u.total || 1;
  return {
    store: u.store,
    used,
    avail,
    total,
    usedPct: (used / denom) * 100,
    estimatedFull: u['estimated-full-date'] || null,
  };
}

/** Datastore usage with a fallback for tokens lacking `/status` access. */
async function fetchDatastores(cfg: PbsConfig): Promise<{ datastores: PbsDatastore[]; reached: boolean; error?: string }> {
  try {
    const usage = await pbsGet<RawUsage[]>(cfg, '/status/datastore-usage');
    return { datastores: usage.map(usageToDatastore), reached: true };
  } catch (err) {
    // Fallback: list datastores, then read each one's status individually.
    try {
      const list = await pbsGet<Array<{ store: string }>>(cfg, '/admin/datastore');
      const datastores = await Promise.all(
        list.map(async (d) => {
          const st = await pbsGet<RawUsage>(
            cfg,
            `/admin/datastore/${encodeURIComponent(d.store)}/status`,
          ).catch(() => ({ store: d.store }) as RawUsage);
          return usageToDatastore({ ...st, store: d.store });
        }),
      );
      return { datastores, reached: true };
    } catch (err2) {
      return { datastores: [], reached: false, error: (err as Error).message || (err2 as Error).message };
    }
  }
}

/** Backup groups for a datastore, across the root and every sub-namespace. */
async function fetchGroups(cfg: PbsConfig, store: string): Promise<Array<RawGroup & { ns: string }>> {
  let namespaces: string[] = [''];
  try {
    // Endpoint is singular `namespace`; PBS caps max-depth at 7. Retry without the
    // param if the query is rejected.
    const base = `/admin/datastore/${encodeURIComponent(store)}/namespace`;
    const nss = await pbsGet<Array<{ ns?: string }>>(cfg, `${base}?max-depth=7`).catch(() =>
      pbsGet<Array<{ ns?: string }>>(cfg, base),
    );
    const names = nss.map((n) => n.ns ?? '');
    namespaces = Array.from(new Set(['', ...names]));
  } catch {
    /* no namespace listing available — fall back to root only */
  }
  const all: Array<RawGroup & { ns: string }> = [];
  await Promise.all(
    namespaces.map(async (ns) => {
      const q = ns ? `?ns=${encodeURIComponent(ns)}` : '';
      const raw = await pbsGet<RawGroup[]>(
        cfg,
        `/admin/datastore/${encodeURIComponent(store)}/groups${q}`,
      ).catch(() => [] as RawGroup[]);
      for (const g of raw) all.push({ ...g, ns });
    }),
  );
  return all;
}

export async function buildPbsSnapshot(cfg: PbsConfig): Promise<PbsSnapshot> {
  const base: Omit<PbsSnapshot, 'reachable' | 'datastores' | 'groups'> = {
    siteId: cfg.siteId,
    name: cfg.name,
    kind: 'pbs',
    webUrl: cfg.baseUrl,
    updatedAt: Date.now(),
  };

  // 'localhost' is the node name on most PBS installs, and listing /nodes sometimes
  // 403s even for admin tokens — so prefer localhost and only discover if it doesn't answer.
  let node = 'localhost';
  let host = await pbsGet<RawHost>(cfg, '/nodes/localhost/status').catch(() => undefined);
  if (!host) {
    const discovered = await pbsGet<Array<{ node: string }>>(cfg, '/nodes')
      .then((n) => n[0]?.node)
      .catch(() => undefined);
    if (discovered) {
      node = discovered;
      host = await pbsGet<RawHost>(cfg, `/nodes/${encodeURIComponent(node)}/status`).catch(
        () => undefined,
      );
    }
  }

  const [{ datastores, reached, error }, tasks] = await Promise.all([
    fetchDatastores(cfg),
    pbsGet<RawTask[]>(cfg, `/nodes/${encodeURIComponent(node)}/tasks?limit=200`).catch(
      () => [] as RawTask[],
    ),
  ]);

  // Reachable if we got ANYTHING back — render partial data rather than blanking.
  const reachable = reached || !!host;
  if (!reachable) {
    return {
      ...base,
      reachable: false,
      error: error ?? 'connection failed',
      datastores: [],
      groups: [],
      updatedAt: Date.now(),
    };
  }

  const groups: PbsBackupGroup[] = [];
  await Promise.all(
    datastores.map(async (d) => {
      const raw = await fetchGroups(cfg, d.store);
      for (const g of raw) {
        groups.push({
          store: d.store,
          ns: g.ns || undefined,
          backupType: g['backup-type'] ?? '?',
          backupId: g['backup-id'] ?? '?',
          lastBackup: g['last-backup'] ?? 0,
          count: g['backup-count'] ?? 0,
        });
      }
    }),
  );
  groups.sort((a, b) => b.lastBackup - a.lastBackup);

  return {
    ...base,
    reachable: true,
    host: host
      ? {
          cpu: host.cpu ?? 0,
          maxcpu: host.cpuinfo?.cpus,
          cpuModel: host.cpuinfo?.model,
          kernel: host.kversion,
          mem: host.memory?.used ?? 0,
          maxmem: host.memory?.total ?? 0,
          uptime: host.uptime ?? 0,
        }
      : undefined,
    datastores,
    groups,
    gc: latestTask(tasks, /garbage_collection/i),
    verify: latestTask(tasks, /verif/i),
    updatedAt: Date.now(),
  };
}
