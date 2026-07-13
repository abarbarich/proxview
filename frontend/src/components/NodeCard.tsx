import type { KeyboardEvent, MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatUptime } from '../lib/format';
import type { NodeSummary } from '../types';
import { Gauge } from './Gauge';
import { GuestRow } from './GuestRow';
import { MeterBar } from './MeterBar';
import { StatusDot } from './StatusDot';
import { TempChip } from './TempChip';
import { WattChip } from './WattChip';

interface Props {
  node: NodeSummary;
  siteId: string;
  siteName: string;
}

export function NodeCard({ node, siteId, siteName }: Props) {
  const offline = node.status === 'offline';
  const tally = (type: 'qemu' | 'lxc') => {
    const list = node.guests.filter((g) => g.type === type);
    const up = list.filter((g) => g.status === 'running').length;
    return { total: list.length, up, down: list.length - up };
  };
  const vm = tally('qemu');
  const ct = tally('lxc');

  const webUi = node.ip ? `https://${node.ip}:8006` : undefined;
  // The whole card is a <Link>, so nesting an <a> is invalid — open the web UI via a span
  // handler and stop the click from also triggering the card's navigation.
  const openWebUi = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (webUi) window.open(webUi, '_blank', 'noopener,noreferrer');
  };

  return (
    <Link
      to={`/site/${encodeURIComponent(siteId)}/node/${encodeURIComponent(node.node)}`}
      className={`node-card ${offline ? 'is-offline' : ''}`}
    >
      <div className="node-head">
        <div className="node-title">
          <StatusDot status={node.status} />
          <div className="node-titles">
            <span className="node-site">
              <span className="kind-chip pve">PVE</span> {siteName}
            </span>
            <span className="node-name">{node.node}</span>
          </div>
        </div>
        <div className="node-head-right">
          {node.ip && (
            <span
              className="node-ip node-ip-link"
              role="link"
              tabIndex={0}
              title={`Open the Proxmox web UI at ${webUi}`}
              onClick={openWebUi}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openWebUi(e);
              }}
            >
              {node.ip} ↗
            </span>
          )}
          <span className="node-uptime">{offline ? 'offline' : `up ${formatUptime(node.uptime)}`}</span>
        </div>
      </div>

      {offline ? (
        <div className="node-offline-body">Node unreachable</div>
      ) : (
        <>
          <div className="node-metrics">
            <Gauge value={node.cpu * 100} label={`${node.maxcpu} cores`} />
            <div className="node-meters">
              <MeterBar label="MEM" used={node.mem} total={node.maxmem} />
              <MeterBar label="DISK" used={node.disk} total={node.maxdisk} />
            </div>
          </div>

          {((node.temps && node.temps.readings.length > 0) ||
            node.power !== undefined ||
            node.systemPower !== undefined) && (
            <div className="node-temps">
              {node.temps?.readings.map((r) => (
                <TempChip key={r.label} reading={r} />
              ))}
              {node.power !== undefined && <WattChip watts={node.power} />}
              {node.systemPower !== undefined && <WattChip watts={node.systemPower} label="System" />}
            </div>
          )}

          <div className="node-guests">
            <div className="node-guests-head">
              <span>Guests</span>
              <span className="guest-tally">
                {vm.total > 0 && (
                  <span className="tally">
                    <span className="tally-type">VM</span>
                    <span className="tally-up">{vm.up}↑</span>
                    {vm.down > 0 && <span className="tally-down">{vm.down}↓</span>}
                  </span>
                )}
                {ct.total > 0 && (
                  <span className="tally">
                    <span className="tally-type">CT</span>
                    <span className="tally-up">{ct.up}↑</span>
                    {ct.down > 0 && <span className="tally-down">{ct.down}↓</span>}
                  </span>
                )}
                {node.guests.length === 0 && <span className="muted-inline">none</span>}
              </span>
            </div>
            <div className="guest-list">
              {node.guests.length === 0 ? (
                <div className="guest-empty">No guests on this node</div>
              ) : (
                node.guests.map((g) => <GuestRow key={g.id} guest={g} siteId={siteId} />)
              )}
            </div>
          </div>
        </>
      )}
    </Link>
  );
}
