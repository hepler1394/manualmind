import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site';

export const revalidate = 300;

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const metadata: Metadata = {
  title: 'The manual library',
  description:
    'Browse community manuals from the ManualMind library — step-by-step guides sourced from official documentation, community forums, expert sites, and video tutorials, with every source cited.',
  alternates: { canonical: '/library' },
};

type Item = { slug: string; title: string; type: string | null; published_at: string | null; verified: boolean };

async function getManuals(): Promise<Item[]> {
  if (!DB_ENABLED) return [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supabase
      .from('manuals')
      .select('title, type, public_slug, published_at, verified')
      .not('public_slug', 'is', null)
      .order('published_at', { ascending: false })
      .limit(60);
    return (data || [])
      .filter((r: any) => r.public_slug)
      .map((r: any) => ({
        slug: r.public_slug,
        title: r.title,
        type: r.type || null,
        published_at: r.published_at,
        verified: !!r.verified,
      }));
  } catch {
    return [];
  }
}

function typeLabel(type?: string | null): string {
  return type === 'official' ? 'Official' : type === 'community' ? 'Community' : 'AI-built';
}

export default async function LibraryPage() {
  const manuals = await getManuals();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'The ManualMind library',
    description: 'Completed manuals, published and searchable.',
    url: siteUrl() + '/library',
    hasPart: manuals.slice(0, 20).map((m) => ({
      '@type': 'Article',
      headline: m.title,
      url: siteUrl() + '/m/' + m.slug,
    })),
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="nav">
        <a className="wordmark" href="/">ManualMind</a>
        <div className="topbar">
          <a className="tb up" href="/">Get a manual</a>
        </div>
      </div>

      <div className="hero" style={{ marginTop: 56 }}>
        <h1 style={{ fontSize: 'clamp(52px, 9vw, 110px)' }}>The library.</h1>
        <p className="tagline">
          Community manuals, published for the next person with the same problem.
          {manuals.length > 0 ? ' ' + manuals.length + ' and counting.' : ''}
        </p>
      </div>

      {manuals.length === 0 ? (
        <div className="welcome" style={{ marginTop: 48 }}>
          <h2>The shelves are being stocked.</h2>
          <p>
            Completed manuals appear here the moment their owners publish them. Be the first —
            generate a manual and press &ldquo;Complete manual.&rdquo;
          </p>
        </div>
      ) : (
        <div className="postergrid">
          {manuals.map((m) => (
            <a key={m.slug} className="poster" href={'/m/' + m.slug}>
              <span className="poster-letter" aria-hidden="true">
                {(m.title || 'M').trim().charAt(0).toUpperCase()}
              </span>
              <span className="poster-type">{m.verified ? '✓ ' : ''}{typeLabel(m.type)} manual</span>
              <span className="poster-title">{m.title}</span>
              {m.published_at && <span className="poster-sub">Published {m.published_at.slice(0, 10)}</span>}
            </a>
          ))}
        </div>
      )}

      <div className="pub-cta" style={{ marginTop: 64 }}>
        <p>Can&apos;t find yours? Build it in about a minute — official sources first, everything cited.</p>
        <a href="/">Get a manual for anything</a>
      </div>

      <div className="footer">ManualMind · finds the real manual first, builds one when it can’t</div>
    </div>
  );
}
