export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / 1024 ** i;
  return `${val.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function pct(used: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatRelative(epochMs: number): string {
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Status colour thresholds for a utilisation percentage. */
export function loadColor(percent: number): string {
  if (percent >= 90) return 'var(--crit)';
  if (percent >= 75) return 'var(--warn)';
  return 'var(--ok)';
}

/** Relative time from an epoch-seconds timestamp (for backup ages). */
export function agoFromSec(sec: number): string {
  if (!sec) return 'never';
  const s = Math.floor(Date.now() / 1000 - sec);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Backup freshness bucket for colouring. */
export function backupAge(lastBackupSec: number): 'ok' | 'warn' | 'crit' {
  if (!lastBackupSec) return 'crit';
  const ageH = (Date.now() / 1000 - lastBackupSec) / 3600;
  if (ageH > 24 * 7) return 'crit';
  if (ageH > 48) return 'warn';
  return 'ok';
}

/** Temperature colour thresholds (°C). CPUs run hotter than drives. */
export function tempColor(value: number, kind: string): string {
  const [warn, crit] = kind === 'cpu' ? [70, 85] : [55, 68];
  if (value >= crit) return 'var(--crit)';
  if (value >= warn) return 'var(--warn)';
  return 'var(--ok)';
}
