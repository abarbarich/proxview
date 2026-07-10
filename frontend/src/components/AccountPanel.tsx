import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { useUsers } from '../store/users';

type Msg = { ok: boolean; text: string } | null;

export function AccountPanel() {
  const me = useAuth((s) => s.user);
  const { users, loaded, load, invite, remove, changePassword } = useUsers();

  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [conf, setConf] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [iuser, setIuser] = useState('');
  const [ipass, setIpass] = useState('');
  const [invMsg, setInvMsg] = useState<Msg>(null);
  const [invBusy, setInvBusy] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const doChangePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (nw.length < 8) return setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
    if (nw !== conf) return setPwMsg({ ok: false, text: 'New passwords do not match.' });
    setPwBusy(true);
    try {
      await changePassword(cur, nw);
      setPwMsg({ ok: true, text: 'Password updated.' });
      setCur('');
      setNw('');
      setConf('');
    } catch (err) {
      setPwMsg({
        ok: false,
        text:
          err instanceof ApiError && err.status === 400
            ? 'Current password is incorrect.'
            : 'Could not update the password.',
      });
    } finally {
      setPwBusy(false);
    }
  };

  const doInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInvMsg(null);
    if (ipass.length < 8) return setInvMsg({ ok: false, text: 'Password must be at least 8 characters.' });
    setInvBusy(true);
    try {
      await invite(iuser.trim(), ipass);
      setInvMsg({ ok: true, text: `User "${iuser.trim()}" created.` });
      setIuser('');
      setIpass('');
    } catch (err) {
      setInvMsg({
        ok: false,
        text:
          err instanceof ApiError && err.status === 409
            ? 'That username is already taken.'
            : 'Could not create the user.',
      });
    } finally {
      setInvBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Account</h2>

      <div className="account-grid">
        <div>
          <div className="pbs-subhead">Change your password</div>
          <form className="form" onSubmit={doChangePw}>
            <label className="field">
              <span>Current password</span>
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" required />
            </label>
            {pwMsg && <div className={pwMsg.ok ? 'test-result ok' : 'form-error'}>{pwMsg.text}</div>}
            <button className="btn" type="submit" disabled={pwBusy}>
              {pwBusy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>

        <div>
          <div className="pbs-subhead">Users</div>
          <div className="site-list">
            {users.map((u) => (
              <div key={u.id} className="site-row">
                <div className="site-row-info">
                  <div className="site-row-name">
                    {u.username}
                    {u.id === me?.id && <span className="self-badge">you</span>}
                  </div>
                </div>
                {u.id !== me?.id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (confirm(`Remove user "${u.username}"?`)) void remove(u.id);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <form className="form invite-form" onSubmit={doInvite}>
            <div className="pbs-subhead">Invite a user</div>
            <div className="ssh-grid">
              <label className="field">
                <span>Username</span>
                <input value={iuser} onChange={(e) => setIuser(e.target.value)} autoComplete="off" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" value={ipass} onChange={(e) => setIpass(e.target.value)} autoComplete="new-password" required />
              </label>
            </div>
            {invMsg && <div className={invMsg.ok ? 'test-result ok' : 'form-error'}>{invMsg.text}</div>}
            <button className="btn btn-ghost" type="submit" disabled={invBusy}>
              {invBusy ? 'Creating…' : 'Create user'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
