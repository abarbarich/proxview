import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { AuthCard } from '../components/AuthCard';
import { ApiError } from '../lib/api';

export default function SetupPage() {
  const phase = useAuth((s) => s.phase);
  const setup = useAuth((s) => s.setup);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [token, setToken] = useState(params.get('token') ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase === 'authed') navigate('/', { replace: true });
    else if (phase === 'anon') navigate('/login', { replace: true });
  }, [phase, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await setup(token.trim(), username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.message : '';
      setError(
        code === 'invalid_token'
          ? 'That setup link is invalid or expired. Restart the container for a fresh one.'
          : code === 'already_configured'
            ? 'ProxView is already set up — please log in.'
            : 'Setup failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your admin account"
      subtitle="First-run setup. Use the one-time token printed to the container logs."
    >
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Setup token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="from docker compose logs"
            autoComplete="off"
            required
          />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}
