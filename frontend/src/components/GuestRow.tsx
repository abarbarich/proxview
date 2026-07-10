import { formatBytes } from '../lib/format';
import type { GuestSummary } from '../types';
import { StatusDot } from './StatusDot';

export function GuestRow({ guest }: { guest: GuestSummary }) {
  const running = guest.status === 'running';
  return (
    <div className={`guest ${running ? '' : 'guest-off'}`}>
      <span className={`type-chip ${guest.type}`}>{guest.type === 'qemu' ? 'VM' : 'CT'}</span>
      <span className="guest-name" title={guest.name}>
        {guest.name}
      </span>
      <StatusDot status={guest.status} />
      <span className="guest-metric">{running ? `${Math.round(guest.cpu * 100)}%` : '—'}</span>
      <span className="guest-metric">{running ? formatBytes(guest.mem) : '—'}</span>
    </div>
  );
}
