import { Agent, request } from 'undici';
import type { GuestSummary, NodeSummary, SiteSnapshot } from './types.js';

export interface PveConfig {
  siteId: string;
  name: string;
  baseUrl: string; // https://host:8006
  tokenId: string; // user@realm!tokenname
  tokenSecret: string;
  tlsVerify: boolean;
}

// One dispatcher per (host, tlsVerify) pair — keeps connections pooled.
const agents = new Map<string, Agent>();
function agentFor(cfg: PveConfig): Agent {
  const key = `${cfg.baseUrl}|${cfg.tlsVerify}`;
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: cfg.tlsVerify, timeout: 8000 } });
    agents.set(key, agent);
  }
  return agent;
}

async function pveGet<T>(cfg: PveConfig, path: string): Promise<T> {
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/api2/json${path}`;
  const res = await request(url, {
    method: 'GET',
    headers: { authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
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

interface RawResource {
  type: string;
  id: string;
  node?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  vmid?: number;
  name?: string;
  template?: number;
}

interface RawClusterStatus {
  type: string;
  name?: string;
  ip?: string; // node management IP (node rows only)
  online?: number;
  quorate?: number;
}

interface RawNodeStatus {
  loadavg?: string[]; // 1/5/15-min load average, returned as strings
  wait?: number; // iowait fraction 0..1
  kversion?: string; // running kernel, e.g. "Linux 6.8.12-1-pve ..."
  cpuinfo?: { model?: string; cpus?: number; cores?: number; sockets?: number };
  swap?: { used?: number; total?: number };
}

export async function testPve(cfg: PveConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const status = await pveGet<RawClusterStatus[]>(cfg, '/cluster/status');
    const cluster = status.find((s) => s.type === 'cluster');
    const nodes = status.filter((s) => s.type === 'node');
    return {
      ok: true,
      message: cluster
        ? `Connected — cluster "${cluster.name}", ${nodes.length} node(s)`
        : `Connected — ${nodes.length || 1} standalone node(s)`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function buildPveSnapshot(cfg: PveConfig): Promise<SiteSnapshot> {
  const base: Omit<SiteSnapshot, 'reachable' | 'nodes'> = {
    siteId: cfg.siteId,
    name: cfg.name,
    kind: 'pve',
    updatedAt: Date.now(),
  };
  try {
    const [resources, status] = await Promise.all([
      pveGet<RawResource[]>(cfg, '/cluster/resources'),
      pveGet<RawClusterStatus[]>(cfg, '/cluster/status').catch(() => [] as RawClusterStatus[]),
    ]);

    const cluster = status.find((s) => s.type === 'cluster');
    const onlineByName = new Map<string, boolean>();
    const ipByName = new Map<string, string>();
    for (const s of status) {
      if (s.type === 'node' && s.name) {
        onlineByName.set(s.name, s.online === 1);
        if (s.ip) ipByName.set(s.name, s.ip);
      }
    }

    const nodeMap = new Map<string, NodeSummary>();
    for (const r of resources) {
      if (r.type !== 'node' || !r.node) continue;
      const online = onlineByName.get(r.node) ?? r.status === 'online';
      nodeMap.set(r.node, {
        node: r.node,
        status: online ? 'online' : 'offline',
        ip: ipByName.get(r.node),
        cpu: r.cpu ?? 0,
        maxcpu: r.maxcpu ?? 0,
        mem: r.mem ?? 0,
        maxmem: r.maxmem ?? 0,
        disk: r.disk ?? 0,
        maxdisk: r.maxdisk ?? 0,
        uptime: r.uptime ?? 0,
        guests: [],
      });
    }

    for (const r of resources) {
      if (r.type !== 'qemu' && r.type !== 'lxc') continue;
      if (r.template === 1) continue;
      const guest: GuestSummary = {
        id: r.id,
        vmid: r.vmid ?? 0,
        type: r.type,
        name: r.name ?? `${r.type}/${r.vmid ?? '?'}`,
        node: r.node ?? '',
        status: (r.status as GuestSummary['status']) ?? 'unknown',
        cpu: r.cpu ?? 0,
        maxcpu: r.maxcpu ?? 0,
        mem: r.mem ?? 0,
        maxmem: r.maxmem ?? 0,
        disk: r.disk ?? 0,
        maxdisk: r.maxdisk ?? 0,
        uptime: r.uptime ?? 0,
      };
      nodeMap.get(guest.node)?.guests.push(guest);
    }

    const nodes = [...nodeMap.values()].sort((a, b) => a.node.localeCompare(b.node));
    for (const n of nodes) n.guests.sort((a, b) => a.vmid - b.vmid);

    // Enrich online nodes with load average from their per-node status — /cluster/resources
    // doesn't carry loadavg. Best-effort and parallel: a node that briefly 5xxs just skips it.
    await Promise.all(
      nodes
        .filter((n) => n.status === 'online')
        .map(async (n) => {
          try {
            const st = await pveGet<RawNodeStatus>(cfg, `/nodes/${encodeURIComponent(n.node)}/status`);
            const la = st.loadavg?.map(Number).filter((x) => Number.isFinite(x));
            if (la && la.length) n.loadavg = la;
            if (typeof st.wait === 'number') n.iowait = st.wait;
            if (st.swap?.total) {
              n.swap = st.swap.used ?? 0;
              n.maxswap = st.swap.total;
            }
            if (st.cpuinfo?.model) n.cpuModel = st.cpuinfo.model;
            if (st.kversion) n.kernel = st.kversion;
          } catch {
            /* per-node status can be momentarily unavailable — leave the extras unset */
          }
        }),
    );

    return {
      ...base,
      reachable: true,
      quorate: cluster ? cluster.quorate === 1 : undefined,
      nodes,
      updatedAt: Date.now(),
    };
  } catch (err) {
    return { ...base, reachable: false, error: (err as Error).message, nodes: [], updatedAt: Date.now() };
  }
}
