import { Client } from 'ssh2';
import type { NodeTemps, TempReading } from './types.js';

export interface SshTarget {
  host: string;
  port: number;
  user: string;
  privateKey: string;
}

const MARKER = '===PVSENSORS===';

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

/** First `tempN_input` value in a sensor object whose name matches `pred`. */
function findTemp(chip: Record<string, unknown>, pred: (name: string) => boolean): number | undefined {
  for (const [name, val] of Object.entries(chip)) {
    if (name === 'Adapter' || !isObj(val) || !pred(name)) continue;
    const key = Object.keys(val).find((k) => /^temp\d+_input$/.test(k));
    if (key) {
      const n = Number(val[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function maxCoreTemp(chip: Record<string, unknown>): number | undefined {
  const cores: number[] = [];
  for (const [name, val] of Object.entries(chip)) {
    if (!/^core /i.test(name) || !isObj(val)) continue;
    const key = Object.keys(val).find((k) => /^temp\d+_input$/.test(k));
    if (key) {
      const n = Number(val[key]);
      if (Number.isFinite(n)) cores.push(n);
    }
  }
  return cores.length ? Math.max(...cores) : undefined;
}

/** Turn `sensors -j` JSON into a normalised NodeTemps (CPU package + drive temps). */
export function parseSensors(raw: Record<string, unknown>): NodeTemps {
  const readings: TempReading[] = [];
  let cpu: number | undefined;
  let nvmeCount = 0;

  for (const [chip, chipVal] of Object.entries(raw ?? {})) {
    if (!isObj(chipVal)) continue;
    const cl = chip.toLowerCase();

    if (cl.startsWith('coretemp') || cl.startsWith('k10temp') || cl.startsWith('zenpower')) {
      const pkg =
        findTemp(chipVal, (s) => /package id 0|tctl|tdie/i.test(s)) ?? maxCoreTemp(chipVal);
      if (pkg !== undefined) cpu = cpu === undefined ? pkg : Math.max(cpu, pkg);
    } else if (cl.startsWith('nvme')) {
      const t = findTemp(chipVal, (s) => /composite/i.test(s)) ?? findTemp(chipVal, () => true);
      if (t !== undefined) {
        nvmeCount += 1;
        readings.push({ label: nvmeCount > 1 ? `NVMe ${nvmeCount}` : 'NVMe', value: t, kind: 'nvme' });
      }
    } else if (cl.startsWith('drivetemp')) {
      const t = findTemp(chipVal, () => true);
      if (t !== undefined) readings.push({ label: 'Drive', value: t, kind: 'drive' });
    }
  }

  if (cpu !== undefined) readings.unshift({ label: 'CPU', value: cpu, kind: 'cpu' });
  return { cpu, readings };
}

const WATTS_MARKER = '===PVWATTS===';
const IPMI_MARKER = '===PVIPMI===';

// Sum the top-level RAPL package domains (skip :N:M subzones) into $w.
const RAPL_SUM =
  'w=0; for f in /sys/class/powercap/intel-rapl:*/energy_uj; do case "$f" in *:*:*) continue;; esac; [ -r "$f" ] && w=$((w+$(cat "$f" 2>/dev/null||echo 0))); done; echo $w';

// Whole-system watts from a BMC, if ipmitool + IPMI are present.
const IPMI_READ =
  "command -v ipmitool >/dev/null 2>&1 && ipmitool dcmi power reading 2>/dev/null | grep -i instantaneous | grep -oE '[0-9]+' | head -1 || echo";

export interface SensorReading {
  hostname: string;
  temps: NodeTemps;
  watts?: number; // CPU package power via RAPL
  systemWatts?: number; // whole-system power via IPMI DCMI
}

/** SSH to a node: short hostname + parsed temps + CPU package watts (RAPL, 1s sample). */
export function fetchNodeTemps(t: SshTarget): Promise<SensorReading> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = '';
    let settled = false;
    const finish = (err?: Error, val?: SensorReading) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(val!);
    };

    const cmd = [
      'hostname',
      `echo '${MARKER}'`,
      'sensors -j 2>/dev/null || echo "{}"',
      `echo '${WATTS_MARKER}'`,
      RAPL_SUM,
      'sleep 1',
      RAPL_SUM,
      `echo '${IPMI_MARKER}'`,
      IPMI_READ,
    ].join('\n');

    conn
      .on('ready', () => {
        conn.exec(cmd, (err, stream) => {
          if (err) return finish(err);
          stream
            .on('close', () => {
              const sIdx = out.indexOf(MARKER);
              const wIdx = out.indexOf(WATTS_MARKER);
              const hostname = (sIdx >= 0 ? out.slice(0, sIdx) : '')
                .trim()
                .split('\n')[0]
                ?.trim()
                .split('.')[0] ?? '';
              const jsonPart = out.slice(
                sIdx >= 0 ? sIdx + MARKER.length : 0,
                wIdx >= 0 ? wIdx : undefined,
              );
              let temps: NodeTemps = { readings: [] };
              try {
                temps = parseSensors(JSON.parse(jsonPart.trim()) as Record<string, unknown>);
              } catch {
                /* lm-sensors not installed / no JSON */
              }
              const iIdx = out.indexOf(IPMI_MARKER);
              let watts: number | undefined;
              if (wIdx >= 0) {
                const nums = out
                  .slice(wIdx + WATTS_MARKER.length, iIdx >= 0 ? iIdx : undefined)
                  .trim()
                  .split(/\s+/)
                  .map(Number)
                  .filter((n) => Number.isFinite(n));
                if (nums.length >= 2 && nums[0]! > 0 && nums[1]! > 0) {
                  const delta = nums[1]! - nums[0]!; // microjoules over ~1s
                  if (delta > 0 && delta < 1e12) watts = Math.round(delta / 1e6);
                }
              }
              let systemWatts: number | undefined;
              if (iIdx >= 0) {
                const n = Number(out.slice(iIdx + IPMI_MARKER.length).trim().split(/\s+/)[0]);
                if (Number.isFinite(n) && n > 0) systemWatts = Math.round(n);
              }
              finish(undefined, { hostname, temps, watts, systemWatts });
            })
            .on('data', (d: Buffer) => {
              out += d.toString();
            });
          stream.stderr.on('data', () => undefined);
        });
      })
      .on('error', (e) => finish(e))
      .connect({
        host: t.host,
        port: t.port,
        username: t.user,
        privateKey: t.privateKey,
        readyTimeout: 9000,
      });
  });
}
