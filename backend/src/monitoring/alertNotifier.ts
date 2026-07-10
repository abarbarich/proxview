import { dispatch } from '../notify/index.js';
import { computeAlerts, type Alert } from './alerts.js';
import type { PbsSnapshot, SiteSnapshot } from './types.js';

const CONFIRM_POLLS = 2; // must persist this many polls before notifying (filters blips)

const pending = new Map<string, number>();
const notified = new Set<string>();
const meta = new Map<string, Alert>();

/**
 * Diff the current alert set against previous evaluations. Fire a notification
 * once an alert has persisted for CONFIRM_POLLS, and a "resolved" note when it clears.
 */
export function evaluateAlerts(sites: SiteSnapshot[], pbs: PbsSnapshot[]): void {
  const current = computeAlerts(sites, pbs);
  const currentKeys = new Set(current.map((a) => a.key));
  for (const a of current) meta.set(a.key, a);

  for (const a of current) {
    const count = (pending.get(a.key) ?? 0) + 1;
    pending.set(a.key, count);
    if (count >= CONFIRM_POLLS && !notified.has(a.key)) {
      notified.add(a.key);
      void dispatch({ title: a.title, body: a.body, level: a.level });
    }
  }

  // Resolved: previously-notified alerts no longer present.
  for (const key of [...notified]) {
    if (!currentKeys.has(key)) {
      notified.delete(key);
      const m = meta.get(key);
      void dispatch({
        title: `Resolved: ${m?.title ?? key}`,
        body: m ? `${m.body} — now cleared.` : 'Condition cleared.',
        level: 'info',
      });
    }
  }
  for (const key of [...pending.keys()]) if (!currentKeys.has(key)) pending.delete(key);
}
