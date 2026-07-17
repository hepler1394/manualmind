import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin', robots: { index: false, follow: false } };

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function monthStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export default async function AdminPage() {
  if (!DB_ENABLED) redirect('/');

  // Owner-only: the first account ever created is the site owner.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = adminClient();
  const { data: firstProfile } = await admin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!firstProfile || firstProfile.id !== user.id) redirect('/');

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [
    { count: users },
    { count: proUsers },
    { count: manualsTotal },
    { count: manualsPublished },
    { count: builtThisMonth },
    { data: searchRows },
    { data: autoBuilt },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'pro'),
    admin.from('manuals').select('*', { count: 'exact', head: true }),
    admin.from('manuals').select('*', { count: 'exact', head: true }).not('public_slug', 'is', null),
    admin.from('usage').select('*', { count: 'exact', head: true }).eq('kind', 'manual').gte('created_at', monthStartISO()),
    admin.from('search_log').select('query, created_at').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(500),
    admin.from('manuals').select('title, public_slug, published_at').contains('meta', { autoLibrary: true }).order('published_at', { ascending: false }).limit(10),
  ]);

  const counts = new Map<string, number>();
  for (const r of searchRows || []) {
    const k = (r.query || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (k.length < 3) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const topSearches = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const stat = (label: string, value: string | number) => (
    <div className="featcard" key={label}>
      <h3 style={{ fontSize: 28 }}>{value}</h3>
      <p>{label}</p>
    </div>
  );

  return (
    <div className="wrap">
      <div className="nav">
        <a className="wordmark" href="/">ManualMind</a>
        <div className="topbar">
          <a className="tb" href="/">Home</a>
        </div>
      </div>

      <div className="hero" style={{ marginTop: 48 }}>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 80px)' }}>Mission control.</h1>
        <p className="tagline">Owner-only. What the engine did while you weren&apos;t looking.</p>
      </div>

      <div className="featgrid" style={{ marginTop: 40 }}>
        {stat('accounts', users ?? 0)}
        {stat('Pro subscribers', proUsers ?? 0)}
        {stat('manuals in libraries', manualsTotal ?? 0)}
        {stat('published to the public library', manualsPublished ?? 0)}
        {stat('manuals generated this month', builtThisMonth ?? 0)}
        {stat('searches, last 7 days', (searchRows || []).length)}
      </div>

      <div className="section" style={{ marginTop: 64 }}>
        <div className="kicker">Demand</div>
        <h2 className="big" style={{ fontSize: 'clamp(26px, 4vw, 40px)' }}>Top searches this week</h2>
        {topSearches.length === 0 ? (
          <p className="sub">No searches logged yet — they start counting from the moment the search log shipped.</p>
        ) : (
          <div className="hlist" style={{ maxWidth: 720, margin: '32px auto 0' }}>
            {topSearches.map(([q, n]) => (
              <div key={q} className="hitem">
                <div className="hmain" style={{ cursor: 'default' }}>
                  <span className="htype">{n}×</span>
                  <span className="htitle">{q}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section" style={{ marginTop: 64 }}>
        <div className="kicker">Auto-library</div>
        <h2 className="big" style={{ fontSize: 'clamp(26px, 4vw, 40px)' }}>Built in the background</h2>
        {(autoBuilt || []).length === 0 ? (
          <p className="sub">Nothing yet — the cron publishes the most-searched missing manual once a day at 9:30 UTC.</p>
        ) : (
          <div className="hlist" style={{ maxWidth: 720, margin: '32px auto 0' }}>
            {(autoBuilt || []).map((m: any) => (
              <div key={m.public_slug} className="hitem">
                <a className="hmain" href={'/m/' + m.public_slug} style={{ textDecoration: 'none' }}>
                  <span className="htype official">auto</span>
                  <span className="htitle">{m.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--faint)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {(m.published_at || '').slice(0, 10)}
                  </span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="footer">Owner-only page · not indexed · refresh for live numbers</div>
    </div>
  );
}
