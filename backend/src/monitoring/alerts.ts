import type { PbsSnapshot, SiteSnapshot } from './types.js';

export interface Alert {
  key: string; // stable identity, used for dedup
  level: 'warn' | 'crit';
  title: string;
  body: string;
}

/** Derive the current alert set from live snapshots. Keys are stable per condition. */
export function computeAlerts(sites: SiteSnapshot[], pbs: PbsSnapshot[]): Alert[] {
  const alerts: Alert[] = [];

  for (const s of sites) {
    if (!s.reachable) {
      alerts.push({
        key: `site-down:${s.siteId}`,
        level: 'crit',
        title: `${s.name} unreachable`,
        body: s.error ?? 'The Proxmox API could not be reached.',
      });
      continue;
    }
    if (s.quorate === false) {
      alerts.push({
        key: `no-quorum:${s.siteId}`,
        level: 'warn',
        title: `${s.name}: no quorum`,
        body: 'The cluster has lost quorum.',
      });
    }
    for (const n of s.nodes) {
      if (n.status === 'offline') {
        alerts.push({
          key: `node-down:${s.siteId}:${n.node}`,
          level: 'crit',
          title: `Node ${n.node} offline`,
          body: `${n.node} on ${s.name} is offline.`,
        });
        continue;
      }
      const memPct = n.maxmem ? (n.mem / n.maxmem) * 100 : 0;
      if (memPct >= 92) {
        alerts.push({
          key: `node-mem:${s.siteId}:${n.node}`,
          level: 'warn',
          title: `${n.node} memory ${Math.round(memPct)}%`,
          body: `Memory usage on ${n.node} (${s.name}) is ${Math.round(memPct)}%.`,
        });
      }
      if (n.temps?.cpu && n.temps.cpu >= 85) {
        alerts.push({
          key: `node-temp:${s.siteId}:${n.node}`,
          level: 'crit',
          title: `${n.node} CPU ${Math.round(n.temps.cpu)}°C`,
          body: `CPU temperature on ${n.node} (${s.name}) is ${Math.round(n.temps.cpu)}°C.`,
        });
      }
    }
  }

  for (const p of pbs) {
    if (!p.reachable) {
      alerts.push({
        key: `pbs-down:${p.siteId}`,
        level: 'crit',
        title: `${p.name} unreachable`,
        body: p.error ?? 'The PBS API could not be reached.',
      });
      continue;
    }
    for (const d of p.datastores) {
      if (d.usedPct >= 90) {
        alerts.push({
          key: `ds-full:${p.siteId}:${d.store}`,
          level: 'crit',
          title: `${d.store} ${Math.round(d.usedPct)}% full`,
          body: `Datastore ${d.store} on ${p.name} is ${Math.round(d.usedPct)}% full.`,
        });
      }
    }
    // One signal per server: has it received ANY backup recently? Avoids noise from
    // intentionally-old archive namespaces and per-source retention.
    if (p.groups.length) {
      const freshest = Math.max(...p.groups.map((g) => g.lastBackup));
      const ageDays = (Date.now() / 1000 - freshest) / 86400;
      if (ageDays > 2) {
        alerts.push({
          key: `backups-idle:${p.siteId}`,
          level: 'warn',
          title: `${p.name}: no backups in ${Math.round(ageDays)}d`,
          body: `The most recent backup on ${p.name} is ${Math.round(ageDays)} days old.`,
        });
      }
    }
    if (p.gc?.status === 'failed') {
      alerts.push({
        key: `gc-failed:${p.siteId}`,
        level: 'crit',
        title: `${p.name} garbage collection failed`,
        body: 'The last GC task on the backup server failed.',
      });
    }
    if (p.verify?.status === 'failed') {
      alerts.push({
        key: `verify-failed:${p.siteId}`,
        level: 'crit',
        title: `${p.name} verification failed`,
        body: 'The last verify task on the backup server failed.',
      });
    }
  }

  return alerts;
}
