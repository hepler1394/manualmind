import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 300;

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Latest published community manuals, for the landing page's featured section.
export async function GET() {
  if (!DB_ENABLED) return NextResponse.json({ manuals: [] });
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
      .limit(6);
    const manuals = (data || [])
      .filter((r: any) => r.public_slug)
      .map((r: any) => ({
        slug: r.public_slug,
        title: r.title,
        type: r.type || 'synthesized',
        published_at: r.published_at ? String(r.published_at).slice(0, 10) : null,
        verified: !!r.verified,
      }));
    return NextResponse.json(
      { manuals },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch {
    return NextResponse.json({ manuals: [] });
  }
}
