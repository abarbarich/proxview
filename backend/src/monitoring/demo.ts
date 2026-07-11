import type { GuestSummary, NodeSummary, PbsSnapshot, SiteSnapshot } from './types.js';

const GB = 1024 ** 3;
const BOOT_REF = 1_700_000_000_000; // fixed past epoch → long, believable uptimes

interface GuestDef {
  vmid: number;
  type: 'qemu' | 'lxc';
  name: string;
  cores: number;
  memGb: number;
  running: boolean;
  load: number; // 0..1 baseline when running
}
interface NodeDef {
  node: string;
  cores: number;
  memGb: number;
  diskGb: number;
  online: boolean;
  guests: GuestDef[];
}
interface SiteDef {
  siteId: string;
  name: string;
  quorate: boolean;
  nodes: NodeDef[];
}

const TOPOLOGY: SiteDef[] = [
  {
    siteId: 'demo-home',
    name: 'Home Rack',
    quorate: true,
    nodes: [
      {
        node: 'pve-core',
        cores: 16,
        memGb: 64,
        diskGb: 2000,
        online: true,
        guests: [
          { vmid: 100, type: 'qemu', name: 'opnsense', cores: 2, memGb: 2, running: true, load: 0.12 },
          { vmid: 101, type: 'qemu', name: 'truenas', cores: 4, memGb: 16, running: true, load: 0.22 },
          { vmid: 102, type: 'qemu', name: 'home-assistant', cores: 2, memGb: 4, running: true, load: 0.18 },
          { vmid: 110, type: 'lxc', name: 'pihole', cores: 1, memGb: 0.5, running: true, load: 0.05 },
          { vmid: 111, type: 'lxc', name: 'nginx-proxy', cores: 1, memGb: 0.5, running: true, load: 0.08 },
        ],
      },
      {
        node: 'pve-compute',
        cores: 12,
        memGb: 48,
        diskGb: 1000,
        online: true,
        guests: [
          { vmid: 200, type: 'qemu', name: 'k3s-master', cores: 4, memGb: 8, running: true, load: 0.35 },
          { vmid: 201, type: 'qemu', name: 'k3s-worker-1', cores: 4, memGb: 8, running: true, load: 0.42 },
          { vmid: 202, type: 'qemu', name: 'windows-11', cores: 4, memGb: 16, running: false, load: 0 },
          { vmid: 210, type: 'lxc', name: 'gitea', cores: 2, memGb: 2, running: true, load: 0.14 },
        ],
      },
      {
        node: 'pve-nas',
        cores: 8,
        memGb: 32,
        diskGb: 4000,
        online: true,
        guests: [
          { vmid: 300, type: 'qemu', name: 'plex', cores: 4, memGb: 8, running: true, load: 0.55 },
          { vmid: 310, type: 'lxc', name: 'jellyfin', cores: 2, memGb: 4, running: true, load: 0.28 },
          { vmid: 311, type: 'lxc', name: 'syncthing', cores: 1, memGb: 1, running: true, load: 0.09 },
        ],
      },
    ],
  },
  {
    siteId: 'demo-edge',
    name: 'Edge Site',
    quorate: false,
    nodes: [
      {
        node: 'edge-1',
        cores: 4,
        memGb: 16,
        diskGb: 512,
        online: true,
        guests: [
          { vmid: 400, type: 'lxc', name: 'wireguard', cores: 1, memGb: 0.5, running: true, load: 0.06 },
          { vmid: 401, type: 'lxc', name: 'uptime-kuma', cores: 1, memGb: 1, running: true, load: 0.11 },
          { vmid: 402, type: 'qemu', name: 'debian-test', cores: 2, memGb: 4, running: false, load: 0 },
        ],
      },
      { node: 'edge-2', cores: 4, memGb: 16, diskGb: 512, online: false, guests: [] },
    ],
  },
];

function seed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
  return h;
}

/** Smooth 0..1 oscillation, phase-shifted per entity so nothing moves in lockstep. */
function wave(key: string, now: number, periodMs: number): number {
  return (Math.sin(now / periodMs + seed(key)) + 1) / 2;
}

export function demoSnapshots(now: number): SiteSnapshot[] {
  return TOPOLOGY.map((site) => {
    const nodes: NodeSummary[] = site.nodes.map((n) => {
      if (!n.online) {
        return {
          node: n.node,
          status: 'offline',
          cpu: 0,
          maxcpu: n.cores,
          mem: 0,
          maxmem: n.memGb * GB,
          disk: 0,
          maxdisk: n.diskGb * GB,
          uptime: 0,
          loadavg: [0, 0, 0],
          guests: [],
        };
      }
      const guests: GuestSummary[] = n.guests.map((g) => {
        const running = g.running;
        const cpu = running ? Math.min(0.98, g.load + 0.25 * wave(g.name, now, 9000)) : 0;
        const memFrac = running ? 0.45 + 0.25 * wave(g.name + 'm', now, 15000) : 0;
        const diskGb = g.type === 'lxc' ? 8 : 32;
        const diskFrac = 0.25 + 0.3 * wave(g.name + 'd', now, 60000);
        return {
          id: `${g.type}/${g.vmid}`,
          vmid: g.vmid,
          type: g.type,
          name: g.name,
          node: n.node,
          status: running ? 'running' : 'stopped',
          cpu,
          maxcpu: g.cores,
          mem: Math.round(memFrac * g.memGb * GB),
          maxmem: g.memGb * GB,
          disk: Math.round(diskFrac * diskGb * GB),
          maxdisk: diskGb * GB,
          uptime: running ? Math.floor((now - BOOT_REF) / 1000) - g.vmid * 137 : 0,
        };
      });
      const cpu = Math.min(0.97, 0.12 + 0.4 * wave(n.node, now, 11000));
      const memFrac = 0.38 + 0.28 * wave(n.node + 'm', now, 21000);
      const diskFrac = 0.5 + 0.12 * wave(n.node + 'd', now, 90000);
      const cpuTemp = Math.round(45 + 15 * wave(`${n.node}t`, now, 13000));
      const nvmeTemp = Math.round(34 + 9 * wave(`${n.node}n`, now, 17000));
      return {
        node: n.node,
        status: 'online',
        cpu,
        maxcpu: n.cores,
        mem: Math.round(memFrac * n.memGb * GB),
        maxmem: n.memGb * GB,
        disk: Math.round(diskFrac * n.diskGb * GB),
        maxdisk: n.diskGb * GB,
        uptime: Math.floor((now - BOOT_REF) / 1000) - seed(n.node) * 91,
        loadavg: [
          Number((cpu * n.cores * 0.9).toFixed(2)),
          Number((cpu * n.cores * 0.8).toFixed(2)),
          Number((cpu * n.cores * 0.7).toFixed(2)),
        ],
        temps: {
          cpu: cpuTemp,
          readings: [
            { label: 'CPU', value: cpuTemp, kind: 'cpu' as const },
            { label: 'NVMe', value: nvmeTemp, kind: 'nvme' as const },
          ],
        },
        power: Math.round(18 + 80 * cpu),
        systemPower: Math.round(70 + 140 * cpu),
        guests,
      };
    });
    return {
      siteId: site.siteId,
      name: site.name,
      kind: 'pve',
      reachable: true,
      quorate: site.quorate,
      nodes,
      updatedAt: now,
    };
  });
}

const TB = 1024 ** 4;

export function demoPbsSnapshots(now: number): PbsSnapshot[] {
  const s = now / 1000;
  const localUsed = (0.6 + 0.05 * wave('pbslocal', now, 120000)) * 8 * TB;
  const offsiteUsed = (0.89 + 0.02 * wave('pbsoff', now, 140000)) * 4 * TB;
  const sources = [
    { type: 'vm', id: 'opnsense', ago: 3.2 },
    { type: 'vm', id: 'truenas', ago: 3.1 },
    { type: 'vm', id: 'home-assistant', ago: 3.0 },
    { type: 'qemu', id: 'plex', ago: 3.4 },
    { type: 'ct', id: 'gitea', ago: 8.0 },
    { type: 'ct', id: 'pihole', ago: 25.0 },
    { type: 'vm', id: 'k3s-master', ago: 3.6 },
    { type: 'host', id: 'pve-core', ago: 26.0 },
    { type: 'ct', id: 'nginx-proxy', ago: 122.0 }, // stale (>5 days)
  ];
  return [
    {
      siteId: 'demo-pbs',
      name: 'Backup Server',
      kind: 'pbs',
      reachable: true,
      host: {
        cpu: 0.06 + 0.08 * wave('pbscpu', now, 9000),
        mem: Math.round((0.25 + 0.08 * wave('pbsmem', now, 15000)) * 32 * GB),
        maxmem: 32 * GB,
        uptime: Math.floor((now - BOOT_REF) / 1000) - 40000,
      },
      temps: {
        cpu: Math.round(41 + 12 * wave('pbst', now, 14000)),
        readings: [
          { label: 'CPU', value: Math.round(41 + 12 * wave('pbst', now, 14000)), kind: 'cpu' as const },
          { label: 'NVMe', value: Math.round(36 + 8 * wave('pbsn', now, 19000)), kind: 'nvme' as const },
        ],
      },
      power: Math.round(28 + 22 * wave('pbsp', now, 12000)),
      systemPower: Math.round(85 + 30 * wave('pbssp', now, 12000)),
      datastores: [
        {
          store: 'local-backups',
          used: Math.round(localUsed),
          avail: Math.round(8 * TB - localUsed),
          total: 8 * TB,
          usedPct: (localUsed / (8 * TB)) * 100,
          estimatedFull: Math.floor(s + 86400 * 240),
        },
        {
          store: 'offsite',
          used: Math.round(offsiteUsed),
          avail: Math.round(4 * TB - offsiteUsed),
          total: 4 * TB,
          usedPct: (offsiteUsed / (4 * TB)) * 100,
          estimatedFull: Math.floor(s + 86400 * 18),
        },
      ],
      groups: sources.map((src) => ({
        store: src.id === 'nginx-proxy' ? 'offsite' : 'local-backups',
        ns: ['home-rack', 'edge', 'core'][seed(src.id) % 3],
        backupType: src.type,
        backupId: src.id,
        lastBackup: Math.floor(s - src.ago * 3600),
        count: Math.round(14 + (seed(src.id) % 20)),
      })),
      gc: { status: 'ok', time: Math.floor(s - 6 * 3600) },
      verify: { status: 'ok', time: Math.floor(s - 26 * 3600) },
      updatedAt: now,
    },
  ];
}

/**
 * Synthesise history for a `${siteId}:node:${node}:${metric}` key so charts have
 * data instantly in demo mode. Uses the same wave functions as the live snapshots.
 */
export function demoSeries(
  key: string,
  fromSec: number,
  toSec: number,
  points: number,
): Array<{ t: number; v: number }> {
  const [, , node, metric] = key.split(':');
  if (!node || !metric) return [];
  const step = Math.max(1, Math.floor((toSec - fromSec) / points));
  const out: Array<{ t: number; v: number }> = [];
  for (let t = fromSec; t <= toSec; t += step) {
    const ms = t * 1000;
    let v = 0;
    if (metric === 'cpu') v = Math.min(0.97, 0.12 + 0.4 * wave(node, ms, 11000));
    else if (metric === 'mem') v = 0.38 + 0.28 * wave(`${node}m`, ms, 21000);
    else if (metric === 'temp') v = 42 + 15 * wave(`${node}t`, ms, 13000);
    else if (metric === 'watts') v = 18 + 80 * Math.min(0.97, 0.12 + 0.4 * wave(node, ms, 11000));
    else if (metric === 'syswatts') v = 70 + 140 * Math.min(0.97, 0.12 + 0.4 * wave(node, ms, 11000));
    out.push({ t, v });
  }
  return out;
}
