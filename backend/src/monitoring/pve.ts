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
  online?: number;
  quorate?: number;
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
    for (const s of status) {
      if (s.type === 'node' && s.name) onlineByName.set(s.name, s.online === 1);
    }

    const nodeMap = new Map<string, NodeSummary>();
    for (const r of resources) {
      if (r.type !== 'node' || !r.node) continue;
      const online = onlineByName.get(r.node) ?? r.status === 'online';
      nodeMap.set(r.node, {
        node: r.node,
        status: online ? 'online' : 'offline',
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
