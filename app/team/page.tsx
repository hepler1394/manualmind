'use client';

import { useEffect, useState } from 'react';

type Member = { user_id: string; role: string; email: string; plan: string };
type Invite = { id: string; email: string; token: string };
type Team = { id: string; name: string; seats: number; status: string; owner_id: string };
type State = {
  signedIn?: boolean;
  me?: string;
  team: Team | null;
  role?: string;
  isOwner?: boolean;
  members?: Member[];
  invites?: Invite[];
};

export default function TeamPage() {
  const [state, setState] = useState<State>({ team: null });
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  }

  async function load() {
    try {
      const res = await fetch('/api/team');
      setState(await res.json());
    } catch {
      setState({ team: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('invite');
      if (t) setInviteToken(t);
      if (window.location.search.includes('upgraded=1')) {
        flash('Team is now on Pro — everyone gets unlimited manuals.');
        window.history.replaceState(null, '', '/team');
      }
    }
    load();
  }, []);

  async function createTeam() {
    setBusy(true);
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'My Team' }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.team) {
      flash('Team created');
      load();
    } else flash(data.error || 'Could not create team');
  }

  async function acceptInvite() {
    if (!inviteToken) return;
    setBusy(true);
    const res = await fetch('/api/team/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      flash('You joined the team');
      setInviteToken(null);
      load();
    } else flash(data.error || 'Could not accept invite');
  }

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setInviteEmail('');
      flash(data.emailed ? 'Invite emailed' : 'Invite link created');
      load();
    } else flash(data.error || 'Could not invite');
  }

  async function upgrade() {
    setBusy(true);
    const res = await fetch('/api/team/checkout', { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (data.url) window.location.href = data.url;
    else flash(data.error || 'Could not start checkout');
  }

  async function remove(userId: string) {
    await fetch('/api/team/members?userId=' + encodeURIComponent(userId), { method: 'DELETE' });
    load();
  }

  function copyInvite(token: string) {
    const url = window.location.origin + '/team?invite=' + token;
    navigator.clipboard.writeText(url).then(() => flash('Invite link copied'));
  }

  const team = state.team;
  const isOwner = state.isOwner;
  const active = team?.status === 'active';

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0' }}>
        <a className="wordmark" href="/" style={{ textDecoration: 'none' }}>ManualMind</a>
        <a className="tb" href="/">Back to app</a>
      </div>

      <h1 style={{ fontSize: 34, letterSpacing: '-0.8px', margin: '18px 0 6px' }}>Team</h1>
      <p style={{ color: 'var(--graphite)', margin: '0 0 26px', fontSize: 17 }}>
        One subscription, up to 5 people. Everyone on the team gets Pro — unlimited manuals and quick-start cards.
      </p>

      {loading && <p style={{ color: 'var(--graphite)' }}>Loading…</p>}

      {!loading && state.signedIn === false && (
        <div className="panel">
          <p style={{ margin: 0 }}>
            Please <a href={'/login'}>sign in</a> to manage your team{inviteToken ? ' and accept your invite' : ''}.
          </p>
        </div>
      )}

      {!loading && state.signedIn !== false && (
        <>
          {inviteToken && !team && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px' }}>You have a team invite</h3>
              <p style={{ color: 'var(--graphite)', margin: '0 0 14px', fontSize: 15 }}>
                Accept to join and unlock Pro across your devices.
              </p>
              <button className="go" disabled={busy} onClick={acceptInvite}>Accept invite</button>
            </div>
          )}

          {!team && !inviteToken && (
            <div className="panel">
              <h3 style={{ margin: '0 0 10px' }}>Create a team</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Team name (e.g. Ace Appliance Repair)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="go" disabled={busy} onClick={createTeam}>Create team</button>
              </div>
            </div>
          )}

          {team && (
            <div className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{team.name}</h3>
                  <span className={'plan ' + (active ? 'pro' : '')} style={{ marginTop: 6, display: 'inline-block' }}>
                    {active ? 'PRO · ACTIVE' : 'NOT ACTIVE'}
                  </span>
                </div>
                {isOwner && !active && (
                  <button className="go" disabled={busy} onClick={upgrade}>Upgrade team — $49/mo</button>
                )}
              </div>

              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--graphite)', marginBottom: 8 }}>
                  Members ({(state.members || []).length} / {team.seats})
                </div>
                {(state.members || []).map((m) => (
                  <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--silver-line)' }}>
                    <span style={{ fontSize: 15 }}>
                      {m.email || m.user_id.slice(0, 8)}{' '}
                      <span style={{ color: 'var(--graphite)', fontSize: 13 }}>· {m.role}</span>
                    </span>
                    {isOwner && m.role !== 'owner' && (
                      <button className="tb" onClick={() => remove(m.user_id)}>Remove</button>
                    )}
                  </div>
                ))}
                {state.role === 'member' && state.me && (
                  <button
                    className="tb"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.confirm('Leave this team? You will lose team Pro.')) {
                        fetch('/api/team/members?userId=' + encodeURIComponent(state.me as string), { method: 'DELETE' }).then(load);
                      }
                    }}
                  >
                    Leave team
                  </button>
                )}
              </div>

              {isOwner && (
                <div style={{ marginTop: 26 }}>
                  <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--graphite)', marginBottom: 8 }}>
                    Invite people
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      type="email"
                      placeholder="teammate@email.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <button className="go" disabled={busy} onClick={sendInvite}>Send invite</button>
                  </div>
                  {(state.invites || []).length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      {(state.invites || []).map((inv) => (
                        <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--silver-line)' }}>
                          <span style={{ fontSize: 14, color: 'var(--graphite)' }}>{inv.email} · pending</span>
                          <button className="tb" onClick={() => copyInvite(inv.token)}>Copy link</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
