import { Link, useParams } from 'react-router-dom';
import { Gauge } from '../components/Gauge';
import { MeterBar } from '../components/MeterBar';
import { StatusDot } from '../components/StatusDot';
import { TempChip } from '../components/TempChip';
import { WattChip } from '../components/WattChip';
import { agoFromSec, backupAge, formatUptime, loadColor } from '../lib/format';
import { useLive } from '../store/live';
import type { PbsTaskStatus } from '../types';

function taskText(t?: PbsTaskStatus): { cls: string; text: string } {
  const status = t?.status ?? 'unknown';
  const cls = status === 'ok' ? 'ok' : status === 'failed' ? 'crit' : status === 'running' ? 'warn' : 'idle';
  const text = status === 'ok' ? 'OK' : status === 'failed' ? 'failed' : status === 'running' ? 'running' : 'unknown';
  return { cls, text };
}

export default function PbsDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const pbs = useLive((s) => (siteId ? s.pbs[siteId] : undefined));

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

          <section className="panel">
            <h2>Backups ({pbs.groups.length})</h2>
            {pbs.groups.length === 0 ? (
              <p className="muted">No backup groups visible for this token.</p>
            ) : (
              <div className="backup-list detail-backups">
                {[...pbs.groups]
                  .sort((a, b) => a.lastBackup - b.lastBackup)
                  .map((g) => (
                    <div
                      key={`${g.store}/${g.ns ?? ''}/${g.backupType}/${g.backupId}`}
                      className="backup-row"
                    >
                      <span className={`type-chip ${g.backupType === 'ct' ? 'lxc' : 'qemu'}`}>
                        {g.backupType.toUpperCase()}
                      </span>
                      <span className="backup-id">{g.backupId}</span>
                      <span className="muted-inline">{g.ns ? `${g.store}/${g.ns}` : g.store}</span>
                      <span className={`backup-age age-${backupAge(g.lastBackup)}`}>
                        {agoFromSec(g.lastBackup)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
