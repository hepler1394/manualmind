import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { FREE_MONTHLY_MANUALS, ANON_DAILY_MANUALS, isPro } from '@/lib/plan';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

type RedditPost = { title: string; subreddit: string; score: number; url: string; body: string };

async function fetchReddit(query: string): Promise<RedditPost[]> {
  try {
    const q = encodeURIComponent(query + ' how to OR manual OR guide OR fix OR setup');
    const url = 'https://www.reddit.com/search.json?q=' + q + '&sort=relevance&limit=12&t=all';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ManualMind/1.0 (manual finder)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const children = (data && data.data && data.data.children) || [];
    return children
      .map((c: any) => c.data)
      .filter((d: any) => d && !d.over_18)
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 8)
      .map((d: any) => ({
        title: d.title || '',
        subreddit: d.subreddit_name_prefixed || ('r/' + (d.subreddit || '')),
        score: d.score || 0,
        url: 'https://www.reddit.com' + (d.permalink || ''),
        body: (d.selftext || '').slice(0, 1200),
      }));
  } catch {
    return [];
  }
}

type Video = { id: string; title: string };

// Scrapes YouTube's search results page (no API key needed).
async function fetchYouTube(query: string): Promise<Video[]> {
  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 900_000);
    const out: Video[] = [];
    const seen = new Set<string>();
    const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,2000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    const seenTitles = new Set<string>();
    while ((m = re.exec(html)) && out.length < 6) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      try {
        const title = JSON.parse('"' + m[2] + '"');
        const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
        if (seenTitles.has(norm)) continue; // near-duplicate uploads of the same tutorial
        seenTitles.add(norm);
        out.push({ id: m[1], title });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

function parseDataUrl(image: string): { mediaType: string; data: string } | null {
  if (!image.startsWith('data:')) return null;
  const semi = image.indexOf(';');
  const comma = image.indexOf(',');
  if (semi < 0 || comma < 0) return null;
  const mediaType = image.slice(5, semi);
  const data = image.slice(comma + 1);
  if (!mediaType || !data) return null;
  return { mediaType, data };
}

async function identifyUpload(
  client: Anthropic,
  parsed: { mediaType: string; data: string },
  hint: string,
): Promise<string> {
  const isPdf = parsed.mediaType === 'application/pdf';
  const hintText = hint ? ('User hint: ' + hint + '. ') : '';
  const block: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.data } }
    : { type: 'image', source: { type: 'base64', media_type: parsed.mediaType as any, data: parsed.data } };
  const question = isPdf
    ? 'Identify what product or subject this document covers, as specifically as possible (brand, model, type). ' +
      hintText +
      'Reply with ONLY the identification, nothing else.'
    : 'Identify the product or object in this image as specifically as possible (brand, model, and type). ' +
      hintText +
      'Read any visible model number, spec label, or rating plate to pin down the exact model. ' +
      'If the device is showing an error code or display message, include it. ' +
      'Reply with ONLY the identification, e.g. "Sony WH-1000XM4 headphones" or ' +
      '"Samsung WF45T6000AW washer displaying error code 4C", nothing else.';
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: [block, { type: 'text', text: question }] }],
  });
  return (
    msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join(' ')
      .trim() || hint
  );
}

function splitMeta(raw: string): { meta: any; body: string } {
  const fence = '```meta';
  const start = raw.indexOf(fence);
  if (start < 0) return { meta: null, body: raw };
  const afterTag = start + fence.length;
  const end = raw.indexOf('```', afterTag);
  if (end < 0) return { meta: null, body: '' };
  let meta: any = null;
  try {
    meta = JSON.parse(raw.slice(afterTag, end).trim());
  } catch {}
  return { meta, body: raw.slice(end + 3).replace(/^\s+/, '') };
}

function monthStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
function dayStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const encoder = new TextEncoder();

  const body = await req.json().catch(() => ({}));
  const query: string = (body.query || '').toString().trim().slice(0, 500);
  let image: string | undefined = body.image;
  if (image && image.length > 6_500_000) image = undefined; // ~4.8MB binary; reject oversized uploads gracefully
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const spaceId: string | null =
    body.spaceId && UUID_RE.test(String(body.spaceId)) ? body.spaceId : null;
  const startedAt = Date.now();

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // Identify the caller (only if the DB/auth layer is configured).
  let user: any = null;
  const admin = DB_ENABLED ? adminClient() : null;
  if (DB_ENABLED) {
    try {
      const supabase = createClient();
      user = (await supabase.auth.getUser()).data.user;
    } catch {
      user = null;
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));

      try {
        if (!apiKey) {
          send({
            stage: 'error',
            message:
              'No ANTHROPIC_API_KEY is set on the server. Add it in Vercel Project Settings, then redeploy.',
          });
          controller.close();
          return;
        }
        if (!query && !image) {
          send({ stage: 'error', message: 'Type something or upload a photo first.' });
          controller.close();
          return;
        }

        // ---- Usage caps (only when DB is enabled) ----
        if (DB_ENABLED && admin) {
          if (user) {
            const { data: profile } = await admin
              .from('profiles')
              .select('plan')
              .eq('id', user.id)
              .single();
            const plan = profile?.plan || 'free';
            if (!isPro(plan)) {
              const { count } = await admin
                .from('usage')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('kind', 'manual')
                .gte('created_at', monthStartISO());
              if ((count || 0) >= FREE_MONTHLY_MANUALS) {
                send({
                  stage: 'limit',
                  signedIn: true,
                  message:
                    'You have used all ' + FREE_MONTHLY_MANUALS +
                    ' free manuals this month. Upgrade to Pro for unlimited manuals.',
                });
                controller.close();
                return;
              }
            }
          } else {
            const { count } = await admin
              .from('usage')
              .select('*', { count: 'exact', head: true })
              .is('user_id', null)
              .eq('ip', ip)
              .gte('created_at', dayStartISO());
            if ((count || 0) >= ANON_DAILY_MANUALS) {
              send({
                stage: 'limit',
                signedIn: false,
                message:
                  'You have reached the free daily limit. Sign in (free) for more, or upgrade to Pro for unlimited.',
              });
              controller.close();
              return;
            }
          }
        }

        const client = new Anthropic({ apiKey });

        const parsedUpload = image ? parseDataUrl(image) : null;
        const isPdf = parsedUpload?.mediaType === 'application/pdf';

        let subject = query;
        if (parsedUpload) {
          send({ stage: 'identify' });
          subject = await identifyUpload(client, parsedUpload, query);
          send({ stage: 'identified', product: subject });
        }

        send({ stage: 'reddit' });
        const reddit = await fetchReddit(subject);
        send({ stage: 'reddit_done', count: reddit.length });

        send({ stage: 'youtube' });
        const videos = await fetchYouTube(subject + ' how to');
        send({ stage: 'youtube_done', videos: videos.slice(0, 4) });

        const redditContext =
          reddit.length > 0
            ? reddit
                .map(
                  (p, i) =>
                    '[' + (i + 1) + '] ' + p.title + ' (' + p.subreddit + ', ' + p.score +
                    ' upvotes) ' + p.url +
                    (p.body ? ('\n    ' + p.body.replace(/\s+/g, ' ').slice(0, 600)) : ''),
                )
                .join('\n')
            : '(no Reddit threads found)';

        const system =
          'You are ManualMind, an expert technical-manual engine. Your one job is producing the single most useful manual for the item or task the user needs help with. You are a manual specialist, not a general chatbot.\n\n' +
          'SAFETY — non-negotiable. Refuse to produce a manual when the request is for: weapons, explosives, or dangerous chemical/biological agents; illegal drugs or drug synthesis; breaking into, unlocking, or tracking property, accounts, or devices the user does not own; defeating security systems, anti-theft measures, or surveillance of other people; anything intended to harm people or animals; or bypassing safety interlocks on equipment in ways that endanger others. When refusing, output the meta block with {"type":"declined"} and then 2-3 sentences politely explaining that ManualMind only builds manuals for safe, legitimate tasks — and, where one exists, suggest the closest legitimate alternative (e.g. a locksmith, the manufacturer\'s account-recovery process). Jailbreaking or repairing a device the USER owns, standard repairs, and safety-conscious DIY are all fine.\n\n' +
          'For legitimate but hazardous work (gas, mains electrical, structural, automotive brakes), include a prominent Safety section and say clearly when a licensed professional is required.';

        const youtubeContext =
          videos.length > 0
            ? videos
                .map((v, i) => '[' + (i + 1) + '] ' + v.title + ' — https://www.youtube.com/watch?v=' + v.id)
                .join('\n')
            : '(no YouTube videos found)';

        const userPrompt =
          'The user needs a manual or guide for: "' + subject + '".\n\n' +
          'Community discussions found so far (real-world tips, gotchas, fixes — cite the most useful):\n' +
          redditContext +
          '\n\nVideo tutorials found:\n' +
          youtubeContext +
          '\n\nInstructions:\n' +
          '1. Use web_search to find the OFFICIAL manufacturer manual, user guide, datasheet, or PDF for this item if one plausibly exists. Search smartly (model number + "manual" / "user guide" / "pdf").\n' +
          '2. Use web_search to broaden beyond the discussions above: specialist forums, Stack Exchange, iFixit and repair wikis, manufacturer support pages, and reputable expert sites. Pull in the best real-world fixes wherever they live.\n' +
          '3. Begin your reply with ONE fenced code block tagged meta containing minified JSON: {"product":"<best name>","officialManual":"<direct URL or empty>","type":"official|community|synthesized|declined","confidence":"high|medium|low"}.\n' +
          '4. After the meta block, write a clear Markdown manual: a one-line summary, then sections like Overview, What You Need, Step-by-Step, Tips & Common Mistakes, Troubleshooting, and Safety if relevant. Be specific and practical. Hyperlink liberally: whenever a step relies on a specific source, part, tool, or download, link it inline as a markdown link. Where a step is much easier to follow on video, reference the most relevant video tutorial inline as a markdown link.\n' +
          '5. End with a "## Sources" section listing every official link, community thread, and video you used, as markdown links.\n\n' +
          (isPdf
            ? 'IMPORTANT: The user attached a PDF document (shown above the instructions). Base the manual primarily on that document — treat it as the authoritative source — and use Reddit/web/YouTube only to fill gaps with real-world tips.\n\n'
            : '') +
          'Prefer verified facts from the official manual over guesses.';

        send({ stage: 'generate' });

        const userContent: any =
          isPdf && parsedUpload
            ? [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: parsedUpload.data },
                },
                { type: 'text', text: userPrompt },
              ]
            : userPrompt;

        let full = '';
        const msgStream = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as any],
          messages: [{ role: 'user', content: userContent }],
        });

        for await (const event of msgStream) {
          if (
            event.type === 'content_block_start' &&
            (event as any).content_block &&
            (event as any).content_block.type === 'server_tool_use'
          ) {
            send({ stage: 'searching' });
          }
          if (
            event.type === 'content_block_delta' &&
            (event as any).delta &&
            (event as any).delta.type === 'text_delta'
          ) {
            const t = (event as any).delta.text;
            full += t;
            send({ stage: 'token', text: t });
          }
        }

        // ---- Record usage + save manual ----
        if (DB_ENABLED && admin) {
          try {
            await admin.from('usage').insert({ user_id: user ? user.id : null, ip, kind: 'manual' });
            if (user && full && !full.includes('"type":"declined"')) {
              const { meta, body: manualBody } = splitMeta(full);
              const { data: inserted } = await admin
                .from('manuals')
                .insert({
                  user_id: user.id,
                  space_id: spaceId,
                  title: (meta && meta.product) || subject || 'Manual',
                  type: (meta && meta.type) || 'synthesized',
                  body: manualBody || full,
                  meta: meta || null,
                  official_manual: (meta && meta.officialManual) || null,
                })
                .select('id')
                .single();
              if (inserted && inserted.id) send({ stage: 'saved', id: inserted.id });
            }
          } catch {
            // non-fatal: still return the manual to the user
          }
        }

        send({ stage: 'done', seconds: Math.round((Date.now() - startedAt) / 1000) });
      } catch (e: any) {
        send({ stage: 'error', message: e && e.message ? e.message : String(e) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
