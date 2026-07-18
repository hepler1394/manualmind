import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { adminClient } from '@/lib/supabase/admin';
import {
  fetchReddit,
  fetchYouTube,
  redditContextOf,
  youtubeContextOf,
  splitMetaBlock,
  slugify,
} from '@/lib/sources';

export const runtime = 'nodejs';
export const maxDuration = 60;
// GET route handlers are statically cached at build time unless forced dynamic —
// without this, the route runs during `next build` and serves that frozen result forever.
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-5';

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// The auto-library: once a day, look at what people actually searched for,
// pick the most-wanted topic that has no published manual yet, build the
// manual in the background, and publish it — so the library grows on its own
// and the next person with that problem lands on a finished page.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== 'Bearer ' + secret) return new Response('Unauthorized', { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!DB_ENABLED || !apiKey) return NextResponse.json({ ok: false, reason: 'not configured' });

  const admin = adminClient();

  // 1) Aggregate the last 7 days of searches.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: logs } = await admin
    .from('search_log')
    .select('query')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  const counts = new Map<string, { q: string; n: number }>();
  for (const row of logs || []) {
    const raw = (row.query || '').trim();
    if (raw.length < 8 || raw.length > 200) continue; // junk guard
    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { q: raw, n: 1 });
  }
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  if (ranked.length === 0) return NextResponse.json({ ok: true, built: 0, reason: 'no searches' });

  // 2) Skip topics that already have a published manual (title or slug overlap).
  const { data: published } = await admin
    .from('manuals')
    .select('title, public_slug')
    .not('public_slug', 'is', null)
    .limit(500);
  const haveTitles = (published || []).map((m: any) => (m.title || '').toLowerCase());
  const haveSlugs = new Set((published || []).map((m: any) => m.public_slug));
  const candidate = ranked.find(({ q }) => {
    const slug = slugify(q);
    if (haveSlugs.has(slug)) return false;
    const ql = q.toLowerCase();
    return !haveTitles.some((t) => t.includes(ql.slice(0, 40)) || ql.includes(t.slice(0, 40)));
  });
  if (!candidate) return NextResponse.json({ ok: true, built: 0, reason: 'all covered' });

  // 3) The library needs an owner for the row: the site owner (first profile).
  const { data: owner } = await admin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!owner) return NextResponse.json({ ok: false, reason: 'no owner profile' });

  // 4) Build the manual exactly like the live engine (community + video + web search).
  const subject = candidate.q;
  const [reddit, videos] = await Promise.all([fetchReddit(subject), fetchYouTube(subject + ' how to')]);

  const system =
    'You are ManualMind, an expert technical-manual engine. Produce the single most useful manual for the topic. ' +
    'Refuse unsafe or illegal topics (weapons, break-ins, defeating others\' security, harm) by replying with meta type "declined". ' +
    'This manual is auto-published to a public library, so keep it universally useful, neutral, and fully sourced.';

  const prompt =
    'Build the definitive manual for: "' + subject + '".\n\n' +
    'Community discussions found:\n' + redditContextOf(reddit) +
    '\n\nVideo tutorials found:\n' + youtubeContextOf(videos) +
    '\n\nInstructions:\n' +
    '1. Use web_search for the official documentation and the best specialist sources (forums, Stack Exchange, iFixit, manufacturer pages).\n' +
    '2. Begin with ONE fenced code block tagged meta containing minified JSON: {"product":"<title-case name>","officialManual":"<direct URL or empty>","type":"official|community|synthesized|declined","confidence":"high|medium|low"}.\n' +
    '3. Then a Markdown manual: one-line summary, Overview, What You Need, Step-by-Step, Tips & Common Mistakes, Troubleshooting, Safety if relevant. Hyperlink every claim that has a source.\n' +
    '4. End with "## Sources" listing every link used.';

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3500,
    system,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 } as any],
    messages: [{ role: 'user', content: prompt }],
  });
  const full = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const { meta, body } = splitMetaBlock(full);
  if (!body || body.length < 400 || (meta && meta.type === 'declined')) {
    return NextResponse.json({ ok: true, built: 0, reason: 'declined or too thin', subject });
  }

  // 5) Publish. Re-check coverage with FRESH data right before inserting —
  // generation takes a minute, and a concurrent run may have covered the topic meanwhile.
  const title = (meta && meta.product) || subject;
  let slug = slugify(title);
  const { data: freshRows } = await admin
    .from('manuals')
    .select('title, public_slug')
    .not('public_slug', 'is', null)
    .limit(500);
  const freshTitles = (freshRows || []).map((m: any) => (m.title || '').toLowerCase());
  const freshSlugs = new Set((freshRows || []).map((m: any) => m.public_slug));
  const subjectL = subject.toLowerCase();
  const titleL = title.toLowerCase();
  const covered = freshSlugs.has(slug) ||
    freshTitles.some((t) =>
      t.includes(subjectL.slice(0, 40)) || subjectL.includes(t.slice(0, 40)) ||
      t.includes(titleL.slice(0, 40)) || titleL.includes(t.slice(0, 40)));
  if (covered) {
    return NextResponse.json({
      ok: true,
      built: 0,
      reason: 'covered during generation',
      subject,
      debug: {
        publishedAtStart: (published || []).length,
        slugsAtStart: [...haveSlugs].slice(0, 10),
        rankedTop: ranked.slice(0, 3).map((r) => r.q),
      },
    });
  }
  if (freshSlugs.has(slug)) slug = slug + '-' + Math.random().toString(36).slice(2, 6);
  const { error } = await admin.from('manuals').insert({
    user_id: owner.id,
    title,
    type: (meta && meta.type) || 'synthesized',
    body,
    meta: { ...(meta || {}), videos: videos.slice(0, 4), autoLibrary: true },
    official_manual: (meta && meta.officialManual) || null,
    public_slug: slug,
    published_at: new Date().toISOString(),
    verified: true,
  });
  if (error) return NextResponse.json({ ok: false, reason: error.message });

  return NextResponse.json({ ok: true, built: 1, subject, slug, searches: candidate.n });
}
