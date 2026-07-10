import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../config/env.js';
import { getConnectivity } from './store.js';

/**
 * Supervises the optional remote-access tunnels (Cloudflare, Tailscale) as
 * child processes of the ProxView container, driven by the encrypted config in
 * the DB. This is what lets the setup wizards apply a token without the user
 * ever editing .env or running a compose command.
 */

interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}
let log: Logger = { info: () => {}, error: () => {} };

type ServiceState = 'off' | 'starting' | 'running' | 'error';

interface Runner {
  proc: ChildProcess | null;
  state: ServiceState;
  detail?: string;
}

const cloudflare: Runner = { proc: null, state: 'off' };
const tailscale: Runner = { proc: null, state: 'off' };

const TS_STATE_DIR = join(env.dataDir, 'tailscale');
const TS_SOCK = join(TS_STATE_DIR, 'tailscaled.sock');

function binaryExists(bin: string): boolean {
  const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
  return !r.error;
}

// --- Cloudflare Tunnel -----------------------------------------------------

function stopCloudflare(): void {
  if (cloudflare.proc) {
    cloudflare.proc.removeAllListeners();
    cloudflare.proc.kill('SIGTERM');
    cloudflare.proc = null;
  }
  cloudflare.state = 'off';
  cloudflare.detail = undefined;
}

function startCloudflare(token: string): void {
  stopCloudflare();
  if (!binaryExists('cloudflared')) {
    cloudflare.state = 'error';
    cloudflare.detail = 'cloudflared binary not found — rebuild the ProxView image to enable this.';
    log.error('[connectivity] cloudflared binary missing');
    return;
  }
  cloudflare.state = 'starting';
  cloudflare.detail = undefined;
  const proc = spawn(
    'cloudflared',
    ['tunnel', '--no-autoupdate', 'run', '--token', token],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  cloudflare.proc = proc;
  proc.on('spawn', () => {
    cloudflare.state = 'running';
    log.info('[connectivity] cloudflared started');
  });
  const watch = (buf: Buffer): void => {
    const text = buf.toString();
    if (/Registered tunnel connection|Connection .* registered/i.test(text)) {
      cloudflare.state = 'running';
    }
    if (/\berror\b|failed to|unauthorized|invalid tunnel/i.test(text)) {
      cloudflare.detail = text.split('\n').find((l) => /error|failed|invalid|unauthorized/i.test(l))?.slice(0, 240);
    }
  };
  proc.stdout?.on('data', watch);
  proc.stderr?.on('data', watch);
  proc.on('exit', (code) => {
    if (cloudflare.proc === proc) {
      cloudflare.state = code === 0 ? 'off' : 'error';
      if (code) cloudflare.detail = cloudflare.detail ?? `cloudflared exited (code ${code}) — check the token.`;
      cloudflare.proc = null;
    }
  });
  proc.on('error', (err) => {
    cloudflare.state = 'error';
    cloudflare.detail = err.message;
  });
}

// --- Tailscale -------------------------------------------------------------

function ts(...args: string[]) {
  // encoding: 'utf8' → stdout/stderr are strings (not Buffers).
  return spawnSync('tailscale', ['--socket', TS_SOCK, ...args], { encoding: 'utf8' });
}

function stopTailscale(): void {
  if (tailscale.proc) {
    ts('down'); // best-effort; ignore result
    tailscale.proc.removeAllListeners();
    tailscale.proc.kill('SIGTERM');
    tailscale.proc = null;
  }
  tailscale.state = 'off';
  tailscale.detail = undefined;
}

function startTailscale(authKey: string, funnel: boolean): void {
  stopTailscale();
  if (!binaryExists('tailscaled')) {
    tailscale.state = 'error';
    tailscale.detail = 'tailscaled binary not found — rebuild the ProxView image to enable this.';
    log.error('[connectivity] tailscaled binary missing');
    return;
  }
  mkdirSync(TS_STATE_DIR, { recursive: true });
  tailscale.state = 'starting';
  tailscale.detail = undefined;

  // Userspace networking: no TUN device / NET_ADMIN needed inside the container.
  const proc = spawn(
    'tailscaled',
    [
      '--tun=userspace-networking',
      '--socket',
      TS_SOCK,
      '--state',
      join(TS_STATE_DIR, 'tailscaled.state'),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  tailscale.proc = proc;
  proc.on('error', (err) => {
    tailscale.state = 'error';
    tailscale.detail = err.message;
  });
  proc.on('exit', (code) => {
    if (tailscale.proc === proc) {
      tailscale.state = code === 0 ? 'off' : 'error';
      if (code) tailscale.detail = tailscale.detail ?? `tailscaled exited (code ${code}).`;
      tailscale.proc = null;
    }
  });

  // Bring the node up once the daemon's socket is ready, then publish ProxView.
  let attempts = 0;
  const bringUp = (): void => {
    if (tailscale.proc !== proc) return; // superseded/stopped
    const up = ts(
      'up',
      `--authkey=${authKey}`,
      '--hostname=proxview',
      '--accept-dns=false',
      '--reset',
    );
    if (up.status === 0) {
      ts('serve', '--bg', String(env.port));
      if (funnel) ts('funnel', '--bg', String(env.port));
      tailscale.state = 'running';
      tailscale.detail = tailnetUrl() ?? undefined;
      log.info('[connectivity] tailscale up');
      return;
    }
    if (++attempts < 15) {
      setTimeout(bringUp, 1000);
    } else {
      tailscale.state = 'error';
      tailscale.detail = (up.stderr || up.stdout || 'tailscale up failed').toString().split('\n')[0]?.slice(0, 240);
    }
  };
  setTimeout(bringUp, 800);
}

function tailnetUrl(): string | null {
  const r = ts('status', '--json');
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const dns = (JSON.parse(r.stdout) as { Self?: { DNSName?: string } }).Self?.DNSName;
    return dns ? `https://${dns.replace(/\.$/, '')}` : null;
  } catch {
    return null;
  }
}

// --- Public API ------------------------------------------------------------

/** Reconcile running processes with the persisted config. Safe to call repeatedly. */
export function applyConnectivity(logger?: Logger): void {
  if (logger) log = logger;
  const cfg = getConnectivity();

  if (cfg.cloudflare.enabled && cfg.cloudflare.token) startCloudflare(cfg.cloudflare.token);
  else stopCloudflare();

  if (cfg.tailscale.enabled && cfg.tailscale.authKey) startTailscale(cfg.tailscale.authKey, cfg.tailscale.funnel);
  else stopTailscale();
}

export interface ConnectivityStatus {
  cloudflare: { enabled: boolean; configured: boolean; state: ServiceState; detail?: string };
  tailscale: {
    enabled: boolean;
    configured: boolean;
    funnel: boolean;
    state: ServiceState;
    url?: string;
    detail?: string;
  };
}

export function connectivityStatus(): ConnectivityStatus {
  const cfg = getConnectivity();
  return {
    cloudflare: {
      enabled: cfg.cloudflare.enabled,
      configured: Boolean(cfg.cloudflare.token),
      state: cloudflare.state,
      detail: cloudflare.detail,
    },
    tailscale: {
      enabled: cfg.tailscale.enabled,
      configured: Boolean(cfg.tailscale.authKey),
      funnel: cfg.tailscale.funnel,
      state: tailscale.state,
      url: tailscale.state === 'running' ? tailnetUrl() ?? tailscale.detail : undefined,
      detail: tailscale.detail,
    },
  };
}
