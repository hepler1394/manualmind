import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site';
import PrintButton from './print-button';

export const revalidate = 300;

marked.setOptions({ breaks: true, gfm: true });

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type PublicManual = {
  title: string;
  type: string | null;
  body: string;
  meta: any;
  official_manual: string | null;
  published_at: string | null;
  created_at: string | null;
};

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const getManual = cache(async (slug: string): Promise<PublicManual | null> => {
  if (!DB_ENABLED || !slug) return null;
  try {
    // Anon client: RLS only exposes rows the owner explicitly published.
    const { data } = await anonClient()
      .from('manuals')
      .select('title, type, body, meta, official_manual, published_at, created_at')
      .eq('public_slug', slug)
      .single();
    return (data as PublicManual) || null;
  } catch {
    return null;
  }
});

async function getRelated(slug: string): Promise<{ slug: string; title: string }[]> {
  if (!DB_ENABLED) return [];
  try {
    const { data } = await anonClient()
      .from('manuals')
      .select('title, public_slug')
      .not('public_slug', 'is', null)
      .neq('public_slug', slug)
      .order('published_at', { ascending: false })
      .limit(8);
    const seen = new Set<string>();
    const out: { slug: string; title: string }[] = [];
    for (const r of data || []) {
      if (!r.public_slug || seen.has(r.title)) continue;
      seen.add(r.title);
      out.push({ slug: r.public_slug, title: r.title });
      if (out.length === 4) break;
    }
    return out;
  } catch {
    return [];
  }
}

function readStats(md: string): { words: number; minutes: number } {
  const words = md.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

function extractToc(md: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const m of md.matchAll(/^##\s+(.+)$/gm)) {
    const text = m[1].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (id) out.push({ id, text });
  }
  return out;
}

function plainDescription(md: string): string {
  const text = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]|-]/g, ' ')
    .replace(/\(https?:[^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 155 ? text.slice(0, 152).trimEnd() + '…' : text;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const manual = await getManual(params.slug);
  if (!manual) return { title: 'Manual not found', robots: { index: false } };
  const title = manual.title + ' — manual & guide';
  const description = plainDescription(manual.body) || 'A step-by-step manual built by ManualMind.';
  const url = siteUrl() + '/m/' + params.slug;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Thin manuals stay out of the index so the library's search quality stays high.
    robots: manual.body.length < 400 ? { index: false } : undefined,
    openGraph: {
      title,
      description,
      url,
      siteName: 'ManualMind',
      type: 'article',
      publishedTime: manual.published_at || undefined,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicManualPage({ params }: { params: { slug: string } }) {
  const manual = await getManual(params.slug);
  if (!manual) notFound();
  const related = await getRelated(params.slug);
  const publishedDate = (manual.published_at || manual.created_at || '').slice(0, 10);
  const stats = readStats(manual.body);
  const toc = extractToc(manual.body);

  const type = manual.type || 'synthesized';
  const bannerTitle =
    type === 'official' ? 'Official manual found'
      : type === 'community' ? 'Built from community knowledge'
      : 'Manual synthesized by AI';
  // Give h2s stable ids so the table of contents can deep-link into the manual.
  const slugifyHeading = (t: string) =>
    t.replace(/&[a-z#0-9]+;/gi, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const html = (marked.parse(manual.body) as string).replace(
    /<h2>([^<]+)<\/h2>/g,
    (_all, text) => '<h2 id="' + slugifyHeading(text) + '">' + text + '</h2>',
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: manual.title,
    description: plainDescription(manual.body),
    datePublished: manual.published_at || manual.created_at || undefined,
    author: { '@type': 'Organization', name: 'ManualMind' },
    publisher: { '@type': 'Organization', name: 'ManualMind' },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ManualMind', item: siteUrl() },
      { '@type': 'ListItem', position: 2, name: manual.title, item: siteUrl() + '/m/' + params.slug },
    ],
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <a className="pub-brand no-print" href="/">ManualMind</a>

      <div className={'banner ' + type}>
        <span className="tag">
          {type === 'official' ? 'Official' : type === 'community' ? 'Community' : 'AI-built'}
        </span>
        <div>
          <h3>{bannerTitle}</h3>
          {manual.official_manual ? (
            <p>
              Official source:{' '}
              <a href={manual.official_manual} target="_blank" rel="noreferrer">
                {manual.official_manual}
              </a>
            </p>
          ) : (
            <p>Shared from a ManualMind library. Verify safety-critical steps against official sources.</p>
          )}
        </div>
      </div>

      <p className="pub-meta no-print">
        {publishedDate ? 'Published ' + publishedDate + ' · ' : ''}
        {stats.minutes} min read · {stats.words.toLocaleString()} words · From the ManualMind library
      </p>

      {toc.length > 1 && (
        <nav className="toc no-print" aria-label="Contents">
          <h2>On this page</h2>
          {toc.map((t) => (
            <a key={t.id} href={'#' + t.id}>{t.text}</a>
          ))}
        </nav>
      )}

      <div className="result">
        <h1>{manual.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {type === 'synthesized' && (
          <p className="disclaimer">
            This manual was assembled by AI from the sources listed above. Verify safety-critical
            steps against official documentation — and use a professional for gas, mains electrical,
            or structural work.
          </p>
        )}
      </div>

      <div className="pub-actions no-print">
        <PrintButton />
      </div>

      {related.length > 0 && (
        <div className="related no-print">
          <h2>More from the library</h2>
          {related.map((r) => (
            <a key={r.slug} href={'/m/' + r.slug}>{r.title}</a>
          ))}
        </div>
      )}

      <div className="pub-cta no-print">
        <p>Need a manual for something else? ManualMind finds the official one — or builds it for you.</p>
        <a href="/">Get a manual for anything — free</a>
      </div>

      <div className="footer no-print">ManualMind · finds the real manual first, builds one when it can’t · powered by Claude</div>
    </div>
  );
}
