import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type Hit = { slug: string; title: string; type: string | null };

// Searches the public (completed/published) manual library.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ results: [] });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Hit[] = [];
  const seen = new Set<string>();
  const push = (rows: any[] | null) => {
    for (const r of rows || []) {
      if (!r.public_slug || seen.has(r.public_slug)) continue;
      seen.add(r.public_slug);
      results.push({ slug: r.public_slug, title: r.title, type: r.type || null });
    }
  };

  try {
    const like = q.replace(/[%_]/g, '\\$&');
    const { data: byTitle } = await supabase
      .from('manuals')
      .select('title, type, public_slug')
      .not('public_slug', 'is', null)
      .ilike('title', '%' + like + '%')
      .limit(5);
    push(byTitle);

    if (results.length < 5) {
      const { data: byBody } = await supabase
        .from('manuals')
        .select('title, type, public_slug')
        .not('public_slug', 'is', null)
        .textSearch('body', q, { type: 'websearch', config: 'english' })
        .limit(5 - results.length);
      push(byBody);
    }
  } catch {
    // search is best-effort
  }

  return NextResponse.json({ results: results.slice(0, 5) });
}
