import type { PbsSnapshot, SiteSnapshot } from '../types';

interface Alert {
  level: 'warn' | 'crit';
  text: string;
}

function computeAlerts(sites: SiteSnapshot[], pbs: PbsSnapshot[]): Alert[] {
  const alerts: Alert[] = [];
  for (const s of sites) {
    if (!s.reachable) {
      alerts.push({ level: 'crit', text: `${s.name} unreachable` });
      continue;
    }
    if (s.quorate === false) alerts.push({ level: 'warn', text: `${s.name}: no quorum` });
    for (const n of s.nodes) {
      if (n.status === 'offline') {
        alerts.push({ level: 'crit', text: `${n.node} offline` });
        continue;
      }
      const memPct = n.maxmem ? (n.mem / n.maxmem) * 100 : 0;
      if (memPct >= 92) alerts.push({ level: 'warn', text: `${n.node} memory ${Math.round(memPct)}%` });
      if (n.temps?.cpu && n.temps.cpu >= 85)
        alerts.push({ level: 'crit', text: `${n.node} CPU ${Math.round(n.temps.cpu)}°C` });
    }
  }
  for (const p of pbs) {
    if (!p.reachable) {
      alerts.push({ level: 'crit', text: `${p.name} unreachable` });
      continue;
    }
    for (const d of p.datastores) {
      if (d.usedPct >= 90) alerts.push({ level: 'crit', text: `${d.store} ${Math.round(d.usedPct)}% full` });
      else if (d.usedPct >= 80)
        alerts.push({ level: 'warn', text: `${d.store} ${Math.round(d.usedPct)}% full` });
    }
    // One signal per server: has it received ANY backup recently? (avoids noise from
    // intentionally-old archive namespaces / per-source retention).
    if (p.groups.length) {
      const freshest = Math.max(...p.groups.map((g) => g.lastBackup));
      const ageDays = (Date.now() / 1000 - freshest) / 86400;
      if (ageDays > 2)
        alerts.push({ level: 'warn', text: `${p.name}: no backups in ${Math.round(ageDays)}d` });
    }
    if (p.gc?.status === 'failed') alerts.push({ level: 'crit', text: `${p.name} GC failed` });
    if (p.verify?.status === 'failed') alerts.push({ level: 'crit', text: `${p.name} verify failed` });
  }
  return alerts;
}

export function OverviewSummary({ sites, pbs }: { sites: SiteSnapshot[]; pbs: PbsSnapshot[] }) {
  const alerts = computeAlerts(sites, pbs);
  if (alerts.length === 0) return null;

  const critical = alerts.some((a) => a.level === 'crit');
  return (
    <div className={`alert-banner ${critical ? 'crit' : 'warn'}`}>
      <span className="alert-banner-title">
        {critical ? '⛔' : '⚠️'} {alerts.length} alert{alerts.length === 1 ? '' : 's'}
      </span>
      <div className="alert-chips">
        {alerts.map((a, i) => (
          <span key={i} className={`alert-chip ${a.level}`}>
            <span className={`dot ${a.level === 'crit' ? 'crit' : 'warn'}`} />
            {a.text}
          </span>
        ))}
      </div>
    </div>
  );
}
