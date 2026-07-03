'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { IconBook } from '../icons';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasAuth =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [supabase] = useState(() => (hasAuth ? createClient() : null));
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : undefined;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function google() {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="wrap">
      <div className="brand" style={{ marginTop: 48 }}>
        <div className="logo"><IconBook size={17} /></div>
        <h1>ManualMind</h1>
      </div>
      <p className="tagline" style={{ textAlign: 'center' }}>Sign in to save your manual library and unlock Pro.</p>

      <div className="panel" style={{ maxWidth: 420, margin: '30px auto 0' }}>
        {!hasAuth ? (
          <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--muted)' }}>
            Accounts are not enabled on this deployment. Add the Supabase env vars to turn on
            sign-in, cloud library, spaces, and reminders.
          </p>
        ) : sent ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Check your email — we sent a magic sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <>
            <button className="go" style={{ width: '100%', padding: 14 }} onClick={google}>
              Continue with Google
            </button>
            <div style={{ textAlign: 'center', color: 'var(--muted)', margin: '14px 0', fontSize: 13 }}>
              or
            </div>
            <form onSubmit={sendLink}>
              <input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <button className="go" style={{ width: '100%', padding: 14 }} disabled={busy}>
                {busy ? 'Sending…' : 'Email me a magic link'}
              </button>
            </form>
          </>
        )}
        {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}
      </div>

      <div className="footer">
        <a href="/" style={{ color: 'var(--accent)' }}>← Back to ManualMind</a>
      </div>
    </div>
  );
}
