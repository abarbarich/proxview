import { Link } from 'react-router-dom';
import { agoFromSec, backupAge, formatBytes, loadColor } from '../lib/format';
import type { PbsSnapshot, PbsTaskStatus } from '../types';
import { Gauge } from './Gauge';
import { MeterBar } from './MeterBar';
import { StatusDot } from './StatusDot';
import { TempChip } from './TempChip';
import { WattChip } from './WattChip';

function TaskBadge({ label, task }: { label: string; task?: PbsTaskStatus }) {
  const status = task?.status ?? 'unknown';
  const cls =
    status === 'ok' ? 'ok' : status === 'failed' ? 'crit' : status === 'running' ? 'warn' : 'idle';
  const text =
    status === 'ok' ? 'OK' : status === 'failed' ? 'failed' : status === 'running' ? 'running' : '—';
  return (
    <span className="task-badge">
      <span className={`dot ${cls}`} />
      {label} <b>{text}</b>
    </span>
  );
}

export function PbsCard({ pbs }: { pbs: PbsSnapshot }) {
  return (
    <Link className="node-card pbs-card" to={`/pbs/${encodeURIComponent(pbs.siteId)}`}>
      <div className="node-head">
        <div className="node-title">
          <StatusDot status={pbs.reachable ? 'online' : 'offline'} />
          <div className="node-titles">
            <span className="node-site">
              <span className="kind-chip pbs">PBS</span> Backup Server
            </span>
            <span className="node-name">{pbs.name}</span>
          </div>
        </div>
        {!pbs.reachable && <span className="pill pill-crit">unreachable</span>}
      </div>

      {!pbs.reachable ? (
        <div className="node-offline-body">{pbs.error ?? 'connection failed'}</div>
      ) : (
        <>
          {pbs.host && (
            <div className="node-metrics">
              <Gauge
                value={pbs.host.cpu * 100}
                label={pbs.host.maxcpu ? `${pbs.host.maxcpu} cores` : 'host cpu'}
              />
              <div className="node-meters">
                <MeterBar label="MEM" used={pbs.host.mem} total={pbs.host.maxmem} />
              </div>
            </div>
          )}
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
          <div className="pbs-subhead">Datastores</div>
          <div className="pbs-stores">
            {pbs.datastores.map((d) => (
              <div key={d.store} className="meter">
                <div className="meter-head">
                  <span className="meter-label">{d.store}</span>
                  <span className="meter-value">
                    {formatBytes(d.used)}{' '}
                    <span className="meter-total">/ {formatBytes(d.total)}</span>
                  </span>
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

          <div className="node-guests">
            <div className="node-guests-head">
              <span>Backup freshness</span>
              <div className="pbs-tasks">
                <TaskBadge label="GC" task={pbs.gc} />
                <TaskBadge label="Verify" task={pbs.verify} />
              </div>
            </div>
            <div className="backup-list">
              {pbs.groups.length === 0 ? (
                <div className="guest-empty">No backups found</div>
              ) : (
                [...pbs.groups]
                  .sort((a, b) => a.lastBackup - b.lastBackup)
                  .map((g) => (
                    <div
                      key={`${g.store}/${g.ns ?? ''}/${g.backupType}/${g.backupId}`}
                      className="backup-row"
                    >
                      <span className={`type-chip ${g.backupType === 'ct' ? 'lxc' : 'qemu'}`}>
                        {g.backupType.toUpperCase()}
                      </span>
                      <span
                        className="backup-id"
                        title={`${g.ns ? `${g.ns}/` : ''}${g.backupId} · ${g.count} snapshots`}
                      >
                        {g.ns && <span className="backup-ns">{g.ns}/</span>}
                        {g.backupId}
                      </span>
                      <span className={`backup-age age-${backupAge(g.lastBackup)}`}>
                        {agoFromSec(g.lastBackup)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </>
      )}
    </Link>
  );
}
