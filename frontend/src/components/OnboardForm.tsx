import { useState } from 'react';
import { api } from '../lib/api';
import { useSites } from '../store/sites';

interface Step {
  name: string;
  ok: boolean;
  detail: string;
}

export function OnboardForm({ onClose }: { onClose: () => void }) {
  const load = useSites((s) => s.load);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setSteps(null);
    setAdded(null);
    try {
      const r = await api.post<{ ok: boolean; steps: Step[]; site?: { name: string } }>(
        '/api/onboard',
        { host, port: port ? Number(port) : 22, user, password },
      );
      setSteps(r.steps);
      setPassword('');
      if (r.ok && r.site) {
        setAdded(r.site.name);
        await load();
      }
    } catch {
      setError('Onboarding could not run.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="form">
      <p className="ssh-hint">
        Enter a host and a <strong>one-time root password</strong>. ProxView will SSH in, detect
        Proxmox VE / PBS, create a read-only API token, install <code>lm-sensors</code>, and add the
        machine. The password is used once and never stored.
      </p>
      <div className="ssh-grid">
        <label className="field">
          <span>Host / IP</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10" />
        </label>
        <label className="field">
          <span>SSH port</span>
          <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
        </label>
      </div>
      <label className="field">
        <span>SSH user (root recommended)</span>
        <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span>Root password (one-time)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
        />
      </label>

      {steps && (
        <div className="wizard-steps">
          {steps.map((s, i) => (
            <div key={i} className="wizard-step">
              <span className={`dot ${s.ok ? 'ok' : 'crit'}`} />
              <span className="wizard-step-name">{s.name}</span>
              <span className="wizard-step-detail">{s.detail}</span>
            </div>
          ))}
        </div>
      )}
      {added && (
        <div className="test-result ok">✓ Added {added} — it'll appear on the overview shortly.</div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        {added ? (
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={run}
            disabled={running || !host || !user || !password}
          >
            {running ? 'Onboarding…' : 'Onboard machine'}
          </button>
        )}
      </div>
    </div>
  );
}
