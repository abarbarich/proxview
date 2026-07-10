import { getDb } from '../db/index.js';
import type { SiteSnapshot } from './types.js';

const RETENTION_MS = Number(process.env.RETENTION_DAYS ?? 30) * 86_400_000;

export interface SeriesPoint {
  t: number; // epoch seconds
  v: number;
}

/** Series key helpers keep naming consistent between writer and reader. */
export function nodeSeriesKey(siteId: string, node: string, metric: string): string {
  return `${siteId}:node:${node}:${metric}`;
}

/** Persist node-level samples from a poll. Fraction metrics (cpu, mem) stored 0..1. */
export function recordSnapshot(snap: SiteSnapshot): void {
  if (!snap.reachable) return;
  const ts = Math.floor(snap.updatedAt / 1000);
  const rows: Array<[string, number, number]> = [];
  for (const n of snap.nodes) {
    if (n.status !== 'online') continue;
    rows.push([nodeSeriesKey(snap.siteId, n.node, 'cpu'), ts, n.cpu]);
    rows.push([nodeSeriesKey(snap.siteId, n.node, 'mem'), ts, n.maxmem ? n.mem / n.maxmem : 0]);
  }
  if (!rows.length) return;
  const stmt = getDb().prepare('INSERT INTO timeseries(series_key, ts, value) VALUES(?, ?, ?)');
  getDb().transaction(() => {
    for (const r of rows) stmt.run(r[0], r[1], r[2]);
  })();
}

/** Read one series, bucket-averaged to ~`points` samples over [fromSec, toSec]. */
export function readSeries(
  key: string,
  fromSec: number,
  toSec: number,
  points: number,
): SeriesPoint[] {
  const span = Math.max(1, toSec - fromSec);
  const bucket = Math.max(1, Math.floor(span / points));
  const rows = getDb()
    .prepare(
      `SELECT (ts / ?) * ? AS b, AVG(value) AS v
         FROM timeseries
        WHERE series_key = ? AND ts >= ? AND ts <= ?
        GROUP BY b ORDER BY b`,
    )
    .all(bucket, bucket, key, fromSec, toSec) as Array<{ b: number; v: number }>;
  return rows.map((r) => ({ t: r.b, v: r.v }));
}

/** Record a single temperature sample (°C) for a node. */
export function recordTemp(siteId: string, node: string, celsius: number): void {
  getDb()
    .prepare('INSERT INTO timeseries(series_key, ts, value) VALUES(?, ?, ?)')
    .run(nodeSeriesKey(siteId, node, 'temp'), Math.floor(Date.now() / 1000), celsius);
}

/** Record a single CPU power sample (watts) for a node. */
export function recordWatts(siteId: string, node: string, watts: number): void {
  getDb()
    .prepare('INSERT INTO timeseries(series_key, ts, value) VALUES(?, ?, ?)')
    .run(nodeSeriesKey(siteId, node, 'watts'), Math.floor(Date.now() / 1000), watts);
}

/** Record a single whole-system power sample (watts, via IPMI) for a node. */
export function recordSystemWatts(siteId: string, node: string, watts: number): void {
  getDb()
    .prepare('INSERT INTO timeseries(series_key, ts, value) VALUES(?, ?, ?)')
    .run(nodeSeriesKey(siteId, node, 'syswatts'), Math.floor(Date.now() / 1000), watts);
}

export function pruneOld(): void {
  const cutoff = Math.floor((Date.now() - RETENTION_MS) / 1000);
  getDb().prepare('DELETE FROM timeseries WHERE ts < ?').run(cutoff);
}
