import { env } from '../config/env.js';
import { listPbsConfigs, listPveConfigs } from '../sites/repo.js';
import { evaluateAlerts } from './alertNotifier.js';
import { demoPbsSnapshots, demoSnapshots } from './demo.js';
import { buildPbsSnapshot } from './pbs.js';
import { buildPveSnapshot } from './pve.js';
import { broadcast } from './sse.js';
import {
  getNodeSystemWatts,
  getNodeTemps,
  getNodeWatts,
  getSiteSystemWatts,
  getSiteTemps,
  getSiteWatts,
} from './temps.js';
import { pruneOld, recordSnapshot } from './timeseries.js';
import type { PbsSnapshot, SiteSnapshot } from './types.js';

const REAL_INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? 10_000); // PVE live floor ~10s
const DEMO_INTERVAL = 2_500; // snappier for the demo UI

const snapshots = new Map<string, SiteSnapshot>();
const pbsSnapshots = new Map<string, PbsSnapshot>();
let timer: NodeJS.Timeout | undefined;
let logger: { error: (msg: string) => void } = { error: () => undefined };

export function getSnapshots(): SiteSnapshot[] {
  return [...snapshots.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPbsSnapshots(): PbsSnapshot[] {
  return [...pbsSnapshots.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function store(snap: SiteSnapshot): void {
  snapshots.set(snap.siteId, snap);
  broadcast('snapshot', snap);
}

function storePbs(snap: PbsSnapshot): void {
  pbsSnapshots.set(snap.siteId, snap);
  broadcast('pbs', snap);
}

async function tick(): Promise<void> {
  try {
    if (env.demo) {
      const now = Date.now();
      for (const snap of demoSnapshots(now)) store(snap);
      for (const snap of demoPbsSnapshots(now)) storePbs(snap);
    } else {
      const pveConfigs = listPveConfigs();
      const pbsConfigs = listPbsConfigs();
      // Drop snapshots for sites that were deleted/disabled.
      const pveIds = new Set(pveConfigs.map((c) => c.siteId));
      for (const key of [...snapshots.keys()]) if (!pveIds.has(key)) snapshots.delete(key);
      const pbsIds = new Set(pbsConfigs.map((c) => c.siteId));
      for (const key of [...pbsSnapshots.keys()]) if (!pbsIds.has(key)) pbsSnapshots.delete(key);

      await Promise.allSettled([
        ...pveConfigs.map(async (cfg) => {
          const snap = await buildPveSnapshot(cfg);
          for (const n of snap.nodes) {
            const t = getNodeTemps(cfg.siteId, n.node);
            if (t) n.temps = t;
            const w = getNodeWatts(cfg.siteId, n.node);
            if (w) n.power = w; // 0 W = RAPL unavailable — don't publish a misleading reading
            const sw = getNodeSystemWatts(cfg.siteId, n.node);
            if (sw) n.systemPower = sw;
          }
          store(snap);
          recordSnapshot(snap); // persist history (real mode only)
        }),
        ...pbsConfigs.map(async (cfg) => {
          const snap = await buildPbsSnapshot(cfg);
          const t = getSiteTemps(cfg.siteId); // PBS is single-host
          if (t) snap.temps = t;
          const w = getSiteWatts(cfg.siteId);
          if (w) snap.power = w; // 0 W = unavailable
          const sw = getSiteSystemWatts(cfg.siteId);
          if (sw) snap.systemPower = sw;
          storePbs(snap);
        }),
      ]);
    }
    // Evaluate alert conditions against the freshly-updated snapshots.
    evaluateAlerts([...snapshots.values()], [...pbsSnapshots.values()]);
  } catch (err) {
    logger.error(`poller tick failed: ${(err as Error).message}`);
  } finally {
    timer = setTimeout(() => void tick(), env.demo ? DEMO_INTERVAL : REAL_INTERVAL);
  }
}

export function startPoller(log?: { error: (msg: string) => void }): void {
  if (log) logger = log;
  if (!env.demo) {
    try {
      pruneOld();
    } catch {
      /* first-run: table may be empty */
    }
    const prune = setInterval(() => {
      try {
        pruneOld();
      } catch (err) {
        logger.error(`prune failed: ${(err as Error).message}`);
      }
    }, 3_600_000);
    prune.unref?.();
  }
  void tick();
}

export function stopPoller(): void {
  if (timer) clearTimeout(timer);
}
