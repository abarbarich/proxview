import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type ServiceState = 'off' | 'starting' | 'running' | 'error';

interface ConnectivityStatus {
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

const STATE_META: Record<ServiceState, { label: string; cls: string }> = {
  off: { label: 'Not connected', cls: 'off' },
  starting: { label: 'Connecting…', cls: 'starting' },
  running: { label: 'Connected', cls: 'running' },
  error: { label: 'Error', cls: 'error' },
};

function StatusBadge({ state }: { state: ServiceState }) {
  const meta = STATE_META[state];
  return <span className={`conn-status conn-status-${meta.cls}`}>{meta.label}</span>;
}

/** External link styled as a step action — opens the service's own web UI. */
function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer noopener">
      {children} ↗
    </a>
  );
}

function useConnectivity() {
  const [status, setStatus] = useState<ConnectivityStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      setStatus(await api.get<ConnectivityStatus>('/api/connectivity'));
    } catch {
      /* leave stale status on transient errors */
    }
  };

  // Poll briefly so 'starting' → 'running'/'error' transitions surface on their own.
  const pollAwhile = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let n = 0;
    pollRef.current = setInterval(() => {
      void refresh();
      if (++n >= 12 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2000);
  };

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return { status, refresh, pollAwhile };
}

function CloudflareWizard({
  status,
  onChange,
}: {
  status: ConnectivityStatus['cloudflare'] | undefined;
  onChange: () => void;
}) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const state = status?.state ?? 'off';

  const save = async (enabled: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/connectivity/cloudflare', {
        enabled,
        token: token.trim() || undefined,
      });
      setToken('');
      onChange();
    } catch (e) {
      setErr(e instanceof Error && e.message === 'token_required' ? 'Paste a tunnel token first.' : 'Could not apply — check the token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conn-plugin">
      <div className="conn-head">
        <div className="pbs-subhead">Cloudflare Tunnel — public HTTPS, no open ports</div>
        <StatusBadge state={state} />
      </div>
      <ol className="wizard-list">
        <li>
          <OpenLink href="https://one.dash.cloudflare.com/?to=/:account/networks/tunnels">
            Open Cloudflare Zero Trust → Tunnels
          </OpenLink>{' '}
          and create a tunnel.
        </li>
        <li>
          Add a <strong>public hostname</strong>; set the service to <code>http://localhost:8080</code>{' '}
          (the tunnel runs inside ProxView). Protect it with <strong>Cloudflare Access</strong>.
        </li>
        <li>Copy the tunnel token from that page and paste it here:</li>
      </ol>
      <label className="field">
        <span>Tunnel token</span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={status?.configured ? '•••••• (saved — paste to replace)' : 'eyJhIjoi…'}
          autoComplete="off"
        />
      </label>
      {err && <p className="form-error">{err}</p>}
      {status?.detail && state === 'error' && <p className="form-error">{status.detail}</p>}
      <div className="conn-actions">
        <button type="button" className="btn btn-sm" onClick={() => save(true)} disabled={busy}>
          {busy ? 'Applying…' : status?.enabled ? 'Reconnect' : 'Save & connect'}
        </button>
        {status?.enabled && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function TailscaleWizard({
  status,
  onChange,
}: {
  status: ConnectivityStatus['tailscale'] | undefined;
  onChange: () => void;
}) {
  const [key, setKey] = useState('');
  const [funnel, setFunnel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const state = status?.state ?? 'off';

  useEffect(() => {
    if (status) setFunnel(status.funnel);
  }, [status?.funnel]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (enabled: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/connectivity/tailscale', {
        enabled,
        authKey: key.trim() || undefined,
        funnel,
      });
      setKey('');
      onChange();
    } catch (e) {
      setErr(e instanceof Error && e.message === 'authkey_required' ? 'Paste an auth key first.' : 'Could not apply — check the key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="conn-plugin">
      <div className="conn-head">
        <div className="pbs-subhead">Tailscale — tailnet HTTPS, reach nodes privately</div>
        <StatusBadge state={state} />
      </div>
      <ol className="wizard-list">
        <li>
          <OpenLink href="https://login.tailscale.com/admin/settings/keys">
            Open Tailscale admin → Auth keys
          </OpenLink>{' '}
          and generate a <strong>reusable</strong> auth key.
        </li>
        <li>Paste it here and connect:</li>
      </ol>
      <label className="field">
        <span>Auth key</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status?.configured ? '•••••• (saved — paste to replace)' : 'tskey-auth-…'}
          autoComplete="off"
        />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={funnel} onChange={(e) => setFunnel(e.target.checked)} />
        <span>Also expose publicly via Tailscale Funnel</span>
      </label>
      {err && <p className="form-error">{err}</p>}
      {status?.detail && state === 'error' && <p className="form-error">{status.detail}</p>}
      {status?.url && state === 'running' && (
        <p className="ssh-hint">
          Reachable at{' '}
          <a href={status.url} target="_blank" rel="noreferrer noopener">
            {status.url}
          </a>
        </p>
      )}
      <div className="conn-actions">
        <button type="button" className="btn btn-sm" onClick={() => save(true)} disabled={busy}>
          {busy ? 'Applying…' : status?.enabled ? 'Reconnect' : 'Save & connect'}
        </button>
        {status?.enabled && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function WireguardWizard() {
  const [keys, setKeys] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const generate = async () => {
    setBusy(true);
    try {
      setKeys(await api.post<{ privateKey: string; publicKey: string }>('/api/tools/wireguard-keypair'));
    } finally {
      setBusy(false);
    }
  };
  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1200);
    });
  };

  return (
    <div className="conn-plugin">
      <div className="conn-head">
        <div className="pbs-subhead">WireGuard — private tunnel to your nodes</div>
      </div>
      <p className="ssh-hint">
        WireGuard needs kernel-level networking, so it runs as a compose add-on rather than inside
        ProxView. Generate a keypair, then start the plugin.
      </p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
        {busy ? 'Generating…' : 'Generate WireGuard keypair'}
      </button>
      {keys && (
        <div className="wizard-out">
          <div className="wizard-label">Private key → wireguard/wg0.conf [Interface]</div>
          <div className="copy-field">
            <code>{keys.privateKey}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('priv', keys.privateKey)}>
              {copied === 'priv' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="wizard-label">Public key → add as a peer on your WireGuard server</div>
          <div className="copy-field">
            <code>{keys.publicKey}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy('pub', keys.publicKey)}>
              {copied === 'pub' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="wizard-label">Then start the plugin</div>
          <div className="copy-field">
            <code>docker compose -f docker-compose.yml -f docker-compose.wireguard.yml up -d</code>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => copy('cmd', 'docker compose -f docker-compose.yml -f docker-compose.wireguard.yml up -d')}
            >
              {copied === 'cmd' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConnectivityPanel() {
  const { status, refresh, pollAwhile } = useConnectivity();
  const onChange = () => {
    void refresh();
    pollAwhile();
  };

  return (
    <section className="panel">
      <h2>Remote access &amp; connectivity</h2>
      <p className="ssh-hint">
        Reach ProxView from anywhere, or connect to Proxmox / PBS across networks. Each wizard sends
        you to the provider to grab a token — paste it back and ProxView applies it for you. No{' '}
        <code>.env</code> edits, no compose commands.
      </p>
      <CloudflareWizard status={status?.cloudflare} onChange={onChange} />
      <TailscaleWizard status={status?.tailscale} onChange={onChange} />
      <WireguardWizard />
    </section>
  );
}
