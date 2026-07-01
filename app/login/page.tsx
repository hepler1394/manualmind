'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supabase = createClient();
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin + '/auth/callback' : undefined;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
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
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="wrap">
      <div className="brand">
        <div className="logo">📘</div>
        <h1>ManualMind</h1>
      </div>
      <p className="tagline">Sign in to save your manual library and unlock Pro.</p>

      <div className="panel" style={{ maxWidth: 420, margin: '30px auto 0' }}>
        {sent ? (
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
