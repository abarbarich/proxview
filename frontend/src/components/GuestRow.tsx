import { type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import type { GuestSummary } from '../types';
import { StatusDot } from './StatusDot';

/**
 * A guest row. When `siteId` is provided the row becomes a link to the guest
 * detail page. It navigates via onClick (not an <a>) so it can live inside the
 * NodeCard's card-wide <Link> without nesting anchors.
 */
export function GuestRow({ guest, siteId }: { guest: GuestSummary; siteId?: string }) {
  const navigate = useNavigate();
  const running = guest.status === 'running';
  const href = siteId
    ? `/site/${encodeURIComponent(siteId)}/node/${encodeURIComponent(guest.node)}/guest/${guest.vmid}`
    : undefined;

  const go = (e: SyntheticEvent) => {
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(href);
  };

  return (
    <div
      className={`guest ${running ? '' : 'guest-off'} ${href ? 'guest-link' : ''}`}
      onClick={href ? go : undefined}
      onKeyDown={
        href
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') go(e);
            }
          : undefined
      }
      role={href ? 'button' : undefined}
      tabIndex={href ? 0 : undefined}
      title={href ? `View ${guest.name}` : guest.name}
    >
      <span className={`type-chip ${guest.type}`}>{guest.type === 'qemu' ? 'VM' : 'CT'}</span>
      <span className="guest-name">{guest.name}</span>
      <StatusDot status={guest.status} />
      <span className="guest-metric">{running ? `${Math.round(guest.cpu * 100)}%` : '—'}</span>
      <span className="guest-metric">{running ? formatBytes(guest.mem) : '—'}</span>
    </div>
  );
}
