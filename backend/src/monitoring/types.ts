export type SiteKind = 'pve' | 'pbs';

export interface GuestSummary {
  id: string; // e.g. "qemu/100"
  vmid: number;
  type: 'qemu' | 'lxc';
  name: string;
  node: string;
  status: 'running' | 'stopped' | 'paused' | 'unknown';
  cpu: number; // 0..1
  maxcpu: number; // assigned vCPUs
  mem: number; // bytes
  maxmem: number; // bytes
  disk: number; // bytes used (0 for VMs without guest agent)
  maxdisk: number; // bytes provisioned
  uptime: number; // seconds
}

export interface TempReading {
  label: string;
  value: number; // °C
  kind: 'cpu' | 'nvme' | 'drive' | 'other';
}

export interface NodeTemps {
  cpu?: number; // representative package/Tctl temp
  readings: TempReading[];
}

export interface NodeSummary {
  node: string;
  status: 'online' | 'offline';
  cpu: number; // 0..1
  maxcpu: number; // cores
  mem: number; // bytes used
  maxmem: number; // bytes total
  disk: number; // bytes used (root fs)
  maxdisk: number; // bytes total
  uptime: number; // seconds
  loadavg?: number[];
  temps?: NodeTemps;
  power?: number; // CPU package watts (RAPL)
  systemPower?: number; // whole-system watts (IPMI)
  guests: GuestSummary[];
}

export interface SiteSnapshot {
  siteId: string;
  name: string;
  kind: SiteKind;
  reachable: boolean;
  error?: string;
  quorate?: boolean;
  nodes: NodeSummary[];
  updatedAt: number; // epoch ms
}

// --- Proxmox Backup Server -------------------------------------------------
export interface PbsDatastore {
  store: string;
  used: number;
  avail: number;
  total: number;
  usedPct: number;
  estimatedFull?: number | null; // epoch seconds, 0/absent if unknown
}

export interface PbsBackupGroup {
  store: string;
  ns?: string; // namespace ('' / undefined = root)
  backupType: string; // vm | ct | host
  backupId: string;
  lastBackup: number; // epoch seconds
  count: number;
}

export interface PbsTaskStatus {
  status: 'ok' | 'failed' | 'running' | 'unknown';
  time?: number; // epoch seconds of last run
}

export interface PbsSnapshot {
  siteId: string;
  name: string;
  kind: 'pbs';
  reachable: boolean;
  error?: string;
  host?: { cpu: number; mem: number; maxmem: number; uptime: number };
  temps?: NodeTemps;
  power?: number; // CPU package watts (RAPL)
  systemPower?: number; // whole-system watts (IPMI)
  datastores: PbsDatastore[];
  groups: PbsBackupGroup[];
  gc?: PbsTaskStatus;
  verify?: PbsTaskStatus;
  updatedAt: number;
}
