import { decryptSecret, encryptSecret } from '../crypto/secretbox.js';
import { getSetting, setSetting } from '../db/index.js';

export interface ConnectivityConfig {
  cloudflare: { enabled: boolean; token: string };
  tailscale: { enabled: boolean; authKey: string; funnel: boolean };
}

const KEY = 'connectivity';

function empty(): ConnectivityConfig {
  return {
    cloudflare: { enabled: false, token: '' },
    tailscale: { enabled: false, authKey: '', funnel: false },
  };
}

export function getConnectivity(): ConnectivityConfig {
  const raw = getSetting(KEY);
  if (!raw) return empty();
  try {
    const base = empty();
    const parsed = JSON.parse(decryptSecret(raw)) as Partial<ConnectivityConfig>;
    return {
      cloudflare: { ...base.cloudflare, ...parsed.cloudflare },
      tailscale: { ...base.tailscale, ...parsed.tailscale },
    };
  } catch {
    return empty();
  }
}

export function setConnectivity(cfg: ConnectivityConfig): void {
  setSetting(KEY, encryptSecret(JSON.stringify(cfg)));
}
