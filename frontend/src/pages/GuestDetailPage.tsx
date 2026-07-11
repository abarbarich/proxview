import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Gauge } from '../components/Gauge';
import { MeterBar } from '../components/MeterBar';
import { StatusDot } from '../components/StatusDot';
import { TimeChart, type ChartPoint } from '../components/TimeChart';
import { api } from '../lib/api';
import { formatUptime } from '../lib/format';
import { useLive } from '../store/live';

type Range = 'hour' | 'day' | 'week';
const RANGE_LABELS: Record<Range, string> = { hour: '1H', day: '24H', week: '7D' };

interface MetricsResp {
  from: number;
  to: number;
  series: Record<string, ChartPoint[]>;
}

export default function GuestDetailPage() {
  const { siteId, node, vmid } = useParams<{ siteId: string; node: string; vmid: string }>();
  const site = useLive((s) => (siteId ? s.sites[siteId] : undefined));
  // vmid is cluster-unique, so match across nodes (survives a live migration).
  const guest = site?.nodes.flatMap((n) => n.guests).find((g) => g.vmid === Number(vmid));

  const [range, setRange] = useState<Range>('hour');
  const [cpu, setCpu] = useState<ChartPoint[]>([]);
  const [mem, setMem] = useState<ChartPoint[]>([]);

  useEffect(() => {
    if (!siteId || !vmid) return;
    const cpuKey = `${siteId}:guest:${vmid}:cpu`;
    const memKey = `${siteId}:guest:${vmid}:mem`;
    const keys = [cpuKey, memKey].map(encodeURIComponent).join(',');
    let alive = true;
    const load = async () => {
      try {
        const r = await api.get<MetricsResp>(`/api/metrics?keys=${keys}&range=${range}`);
        if (!alive) return;
        setCpu((r.series[cpuKey] ?? []).map((p) => ({ t: p.t, v: p.v * 100 })));
        setMem((r.series[memKey] ?? []).map((p) => ({ t: p.t, v: p.v * 100 })));
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
  }, [siteId, vmid, range]);

  const backTo =
    siteId && node
      ? `/site/${encodeURIComponent(siteId)}/node/${encodeURIComponent(node)}`
      : '/';

  if (!site || !guest) {
    return (
      <div className="detail">
        <Link to={backTo} className="back-link">
          ← Back
        </Link>
        <div className="empty-state center-empty">
          <h2>Guest unavailable</h2>
          <p>It may be stopped, removed, or on a site that isn't loaded.</p>
        </div>
      </div>
    );
  }

  const running = guest.status === 'running';

  return (
    <div className="detail">
      <Link to={backTo} className="back-link">
        ← {node ?? 'Overview'}
      </Link>

      <div className="detail-head">
        <div className="detail-title">
          <StatusDot status={guest.status} />
          <span className={`type-chip ${guest.type}`}>{guest.type === 'qemu' ? 'VM' : 'CT'}</span>
          <h1>{guest.name}</h1>
          <span className="detail-sub">
            {site.name} · {guest.node} · #{guest.vmid}
          </span>
        </div>
        <span className="node-uptime">
          {running ? `up ${formatUptime(guest.uptime)}` : guest.status}
        </span>
      </div>

      <div className="detail-stats panel">
        <Gauge value={guest.cpu * 100} label={`${guest.maxcpu} vCPU`} />
        <div className="detail-meters">
          <MeterBar label="MEMORY" used={guest.mem} total={guest.maxmem} />
          {guest.maxdisk > 0 && <MeterBar label="DISK" used={guest.disk} total={guest.maxdisk} />}
        </div>
      </div>

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
          <div className="chart-title">CPU</div>
          <TimeChart label="CPU" unit="%" color="#4c8dff" points={cpu} yMax={100} />
        </div>
        <div className="chart-panel">
          <div className="chart-title">Memory</div>
          <TimeChart label="MEM" unit="%" color="#34d399" points={mem} yMax={100} />
        </div>
      </div>
    </div>
  );
}
