import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { marked } from 'marked';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site';
import { IconBook, TypeIcon } from '../../icons';

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

const getManual = cache(async (slug: string): Promise<PublicManual | null> => {
  if (!DB_ENABLED || !slug) return null;
  try {
    // Anon client: RLS only exposes rows the owner explicitly published.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supabase
      .from('manuals')
      .select('title, type, body, meta, official_manual, published_at, created_at')
      .eq('public_slug', slug)
      .single();
    return (data as PublicManual) || null;
  } catch {
    return null;
  }
});

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
  if (!manual) return { title: 'Manual not found — ManualMind', robots: { index: false } };
  const title = manual.title + ' — manual & guide | ManualMind';
  const description = plainDescription(manual.body) || 'A step-by-step manual built by ManualMind.';
  const url = siteUrl() + '/m/' + params.slug;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'ManualMind', type: 'article' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PublicManualPage({ params }: { params: { slug: string } }) {
  const manual = await getManual(params.slug);
  if (!manual) notFound();

  const type = manual.type || 'synthesized';
  const bannerTitle =
    type === 'official' ? 'Official manual found'
      : type === 'community' ? 'Built from community knowledge'
      : 'Manual synthesized by AI';
  const html = marked.parse(manual.body) as string;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: manual.title,
    description: plainDescription(manual.body),
    datePublished: manual.published_at || manual.created_at || undefined,
    author: { '@type': 'Organization', name: 'ManualMind' },
    publisher: { '@type': 'Organization', name: 'ManualMind' },
  };

  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a className="pub-brand no-print" href="/">
        <span className="logo" style={{ width: 30, height: 30, borderRadius: 9 }}><IconBook size={15} /></span>
        ManualMind
      </a>

      <div className={'banner ' + type}>
        <span className="ico"><TypeIcon type={type} size={17} /></span>
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

      <div className="result">
        <h1>{manual.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div className="pub-cta no-print">
        <p>Need a manual for something else? ManualMind finds the official one — or builds it for you.</p>
        <a href="/">Get a manual for anything — free</a>
      </div>

      <div className="footer no-print">ManualMind · finds the real manual first, builds one when it can’t · powered by Claude</div>
    </div>
  );
}
