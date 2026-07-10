import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gauge } from '../components/Gauge';
import { MeterBar } from '../components/MeterBar';
import { StatusDot } from '../components/StatusDot';
import { TempChip } from '../components/TempChip';
import { TimeChart, type ChartPoint } from '../components/TimeChart';
import { WattChip } from '../components/WattChip';
import { api } from '../lib/api';
import { agoFromSec, backupAge, formatUptime, loadColor } from '../lib/format';
import { useLive } from '../store/live';
import type { PbsBackupGroup, PbsTaskStatus } from '../types';

type Range = 'hour' | 'day' | 'week';
const RANGE_LABELS: Record<Range, string> = { hour: '1H', day: '24H', week: '7D' };
interface MetricsResp {
  series: Record<string, ChartPoint[]>;
}

function taskText(t?: PbsTaskStatus): { cls: string; text: string } {
  const status = t?.status ?? 'unknown';
  const cls = status === 'ok' ? 'ok' : status === 'failed' ? 'crit' : status === 'running' ? 'warn' : 'idle';
  const text = status === 'ok' ? 'OK' : status === 'failed' ? 'failed' : status === 'running' ? 'running' : 'unknown';
  return { cls, text };
}

interface MachineCluster {
  key: string;
  backupType: string;
  backupId: string;
  freshest: number; // most-recent backup across all locations
  totalCount: number; // total snapshots for this machine
  entries: PbsBackupGroup[]; // one per store/namespace, newest first
}

/** Cluster backup groups by machine (type + id), summing snapshots across namespaces. */
function clusterBackups(groups: PbsBackupGroup[]): MachineCluster[] {
  const map = new Map<string, MachineCluster>();
  for (const g of groups) {
    const key = `${g.backupType}:${g.backupId}`;
    let c = map.get(key);
    if (!c) {
      c = { key, backupType: g.backupType, backupId: g.backupId, freshest: 0, totalCount: 0, entries: [] };
      map.set(key, c);
    }
    c.freshest = Math.max(c.freshest, g.lastBackup);
    c.totalCount += g.count || 0;
    c.entries.push(g);
  }
  const list = [...map.values()];
  for (const c of list) c.entries.sort((a, b) => b.lastBackup - a.lastBackup);
  // Stalest machine first — surfaces the ones at risk (matches the alert logic).
  list.sort((a, b) => a.freshest - b.freshest);
  return list;
}

export default function PbsDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const pbs = useLive((s) => (siteId ? s.pbs[siteId] : undefined));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const clusters = useMemo(() => clusterBackups(pbs?.groups ?? []), [pbs?.groups]);

  const [range, setRange] = useState<Range>('hour');
  const [cpu, setCpu] = useState<ChartPoint[]>([]);
  const [mem, setMem] = useState<ChartPoint[]>([]);
  const [temp, setTemp] = useState<ChartPoint[]>([]);
  const [power, setPower] = useState<ChartPoint[]>([]);

  useEffect(() => {
    if (!siteId) return;
    const cpuKey = `${siteId}:node:pbs:cpu`;
    const memKey = `${siteId}:node:pbs:mem`;
    const tempKey = `${siteId}:node:pbs:temp`;
    const wattKey = `${siteId}:node:pbs:watts`;
    const keys = [cpuKey, memKey, tempKey, wattKey].map(encodeURIComponent).join(',');
    let alive = true;
    const load = async () => {
      try {
        const r = await api.get<MetricsResp>(`/api/metrics?keys=${keys}&range=${range}`);
        if (!alive) return;
        setCpu((r.series[cpuKey] ?? []).map((p) => ({ t: p.t, v: p.v * 100 })));
        setMem((r.series[memKey] ?? []).map((p) => ({ t: p.t, v: p.v * 100 })));
        setTemp((r.series[tempKey] ?? []).map((p) => ({ t: p.t, v: p.v })));
        setPower((r.series[wattKey] ?? []).map((p) => ({ t: p.t, v: p.v })));
      } catch {
        /* transient */
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [siteId, range]);

  if (!pbs) {
    return (
      <div className="detail">
        <Link to="/" className="back-link">
          ← Overview
        </Link>
        <div className="empty-state center-empty">
          <h2>Backup server unavailable</h2>
          <p>It may still be loading.</p>
        </div>
      </div>
    );
  }

  const gc = taskText(pbs.gc);
  const verify = taskText(pbs.verify);

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← Overview
      </Link>

      <div className="detail-head">
        <div className="detail-title">
          <StatusDot status={pbs.reachable ? 'online' : 'offline'} />
          <span className="kind-chip pbs">PBS</span>
          <h1>{pbs.name}</h1>
        </div>
        {pbs.host && <span className="node-uptime">up {formatUptime(pbs.host.uptime)}</span>}
      </div>

      {!pbs.reachable ? (
        <div className="panel err-text" style={{ padding: 18 }}>
          {pbs.error ?? 'connection failed'}
        </div>
      ) : (
        <>
          {pbs.host && (
            <div className="detail-stats panel">
              <Gauge value={pbs.host.cpu * 100} label="host cpu" />
              <div className="detail-meters">
                <MeterBar label="MEMORY" used={pbs.host.mem} total={pbs.host.maxmem} />
                {((pbs.temps && pbs.temps.readings.length > 0) ||
                  pbs.power !== undefined ||
                  pbs.systemPower !== undefined) && (
                  <div className="node-temps">
                    {pbs.temps?.readings.map((r) => (
                      <TempChip key={r.label} reading={r} />
                    ))}
                    {pbs.power !== undefined && <WattChip watts={pbs.power} />}
                    {pbs.systemPower !== undefined && (
                      <WattChip watts={pbs.systemPower} label="System" />
                    )}
                  </div>
                )}
                <div className="pbs-tasks" style={{ marginTop: 4 }}>
                  <span className="task-badge">
                    <span className={`dot ${gc.cls}`} /> Garbage collection <b>{gc.text}</b>
                  </span>
                  <span className="task-badge">
                    <span className={`dot ${verify.cls}`} /> Verify <b>{verify.text}</b>
                  </span>
                </div>
              </div>
            </div>
          )}

          <section className="panel">
            <h2>Datastores</h2>
            {pbs.datastores.length === 0 ? (
              <p className="muted">
                No datastore data. Ensure the API token has <code>Datastore.Audit</code> on the
                datastores (and <code>Sys.Audit</code> for host status).
              </p>
            ) : (
              <div className="pbs-stores">
                {pbs.datastores.map((d) => (
                  <div key={d.store} className="meter">
                    <div className="meter-head">
                      <span className="meter-label">{d.store}</span>
                      <span className="meter-value">{Math.round(d.usedPct)}%</span>
                    </div>
                    <div className="meter-track">
                      <div
                        className="meter-fill"
                        style={{ width: `${d.usedPct}%`, background: loadColor(d.usedPct) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="detail-charts-head">
            <h2>History</h2>
            <div className="range-select">
              {(['hour', 'day', 'week'] as Range[]).map((r) => (
                <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="charts-grid">
            <div className="chart-panel">
              <div className="chart-title">Host CPU</div>
              <TimeChart label="CPU" unit="%" color="#4c8dff" points={cpu} yMax={100} />
            </div>
            <div className="chart-panel">
              <div className="chart-title">Memory</div>
              <TimeChart label="MEM" unit="%" color="#34d399" points={mem} yMax={100} />
            </div>
            {pbs.temps?.cpu != null && (
              <div className="chart-panel">
                <div className="chart-title">CPU Temperature</div>
                <TimeChart label="Temp" unit="°" color="#fbbf24" points={temp} />
              </div>
            )}
            {pbs.power != null && pbs.power > 0 && (
              <div className="chart-panel">
                <div className="chart-title">Power</div>
                <TimeChart label="Power" unit=" W" color="#a78bfa" points={power} />
              </div>
            )}
          </div>

          <section className="panel">
            <h2>
              Backups <span className="count-dim">· {clusters.length} machines</span>
            </h2>
            {clusters.length === 0 ? (
              <p className="muted">No backup groups visible for this token.</p>
            ) : (
              <div className="backup-clusters">
                {clusters.map((c) => {
                  const open = expanded.has(c.key);
                  const multi = c.entries.length > 1;
                  return (
                    <div key={c.key} className={`backup-cluster ${open ? 'open' : ''}`}>
                      <button
                        className="backup-cluster-head"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            n.has(c.key) ? n.delete(c.key) : n.add(c.key);
                            return n;
                          })
                        }
                        aria-expanded={open}
                      >
                        <span className="cluster-caret" aria-hidden="true">
                          ▸
                        </span>
                        <span className={`type-chip ${c.backupType === 'ct' ? 'lxc' : 'qemu'}`}>
                          {c.backupType.toUpperCase()}
                        </span>
                        <span className="backup-id">{c.backupId}</span>
                        <span className="cluster-count">
                          {c.totalCount} backup{c.totalCount === 1 ? '' : 's'}
                          {multi && <span className="muted-inline"> · {c.entries.length} locations</span>}
                        </span>
                        <span className={`backup-age age-${backupAge(c.freshest)}`}>
                          {agoFromSec(c.freshest)}
                        </span>
                      </button>
                      {open && (
                        <div className="backup-cluster-body">
                          {c.entries.map((g) => (
                            <div key={`${g.store}/${g.ns ?? ''}`} className="backup-subrow">
                              <span className="muted-inline">{g.ns ? `${g.store}/${g.ns}` : g.store}</span>
                              <span className="subrow-count">
                                {g.count} snap{g.count === 1 ? '' : 's'}
                              </span>
                              <span className={`backup-age age-${backupAge(g.lastBackup)}`}>
                                {agoFromSec(g.lastBackup)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
