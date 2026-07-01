import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { FREE_MONTHLY_MANUALS, ANON_DAILY_MANUALS, isPro } from '@/lib/plan';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';

type RedditPost = { title: string; subreddit: string; score: number; url: string; body: string };

async function fetchReddit(query: string): Promise<RedditPost[]> {
  try {
    const q = encodeURIComponent(query + ' how to OR manual OR guide OR fix OR setup');
    const url = 'https://www.reddit.com/search.json?q=' + q + '&sort=relevance&limit=8&t=all';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ManualMind/1.0 (manual finder)' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const children = (data && data.data && data.data.children) || [];
    return children
      .map((c: any) => c.data)
      .filter((d: any) => d && !d.over_18)
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

async function identifyImage(client: Anthropic, image: string, hint: string): Promise<string> {
  const parsed = parseDataUrl(image);
  if (!parsed) return hint;
  const hintText = hint ? ('User hint: ' + hint + '. ') : '';
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType as any, data: parsed.data },
          },
          {
            type: 'text',
            text:
              'Identify the product or object in this image as specifically as possible (brand, model, and type). ' +
              hintText +
              'Reply with ONLY the identification (e.g. "Sony WH-1000XM4 headphones"), nothing else.',
          },
        ],
      },
    ],
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
  const query: string = (body.query || '').toString().trim();
  const image: string | undefined = body.image;

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // Identify the caller (may be anonymous).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = adminClient();

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

        // ---- Usage caps ----
        let plan = 'free';
        if (user) {
          const { data: profile } = await admin
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .single();
          plan = profile?.plan || 'free';

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
                  'You have used all ' +
                  FREE_MONTHLY_MANUALS +
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

        const client = new Anthropic({ apiKey });

        let subject = query;
        if (image) {
          send({ stage: 'identify' });
          subject = await identifyImage(client, image, query);
          send({ stage: 'identified', product: subject });
        }

        send({ stage: 'reddit' });
        const reddit = await fetchReddit(subject);
        send({ stage: 'reddit_done', count: reddit.length });

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
          'You are ManualMind, an expert technical-manual engine. Produce the single most useful manual for the item the user needs help with.';

        const userPrompt =
          'The user needs a manual or guide for: "' + subject + '".\n\n' +
          'Reddit community discussions found (real-world tips, gotchas, fixes — cite the most useful):\n' +
          redditContext +
          '\n\nInstructions:\n' +
          '1. Use web_search to find the OFFICIAL manufacturer manual, user guide, datasheet, or PDF for this item if one plausibly exists. Search smartly (model number + "manual" / "user guide" / "pdf").\n' +
          '2. Begin your reply with ONE fenced code block tagged meta containing minified JSON: {"product":"<best name>","officialManual":"<direct URL or empty>","type":"official|community|synthesized","confidence":"high|medium|low"}.\n' +
          '3. After the meta block, write a clear Markdown manual: a one-line summary, then sections like Overview, What You Need, Step-by-Step, Tips & Common Mistakes, Troubleshooting, and Safety if relevant. Be specific and practical.\n' +
          '4. End with a "## Sources" section listing every official link and Reddit thread you used, as markdown links.\n\n' +
          'Prefer verified facts from the official manual over guesses.';

        send({ stage: 'generate' });

        let full = '';
        const msgStream = client.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as any],
          messages: [{ role: 'user', content: userPrompt }],
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
        await admin.from('usage').insert({ user_id: user ? user.id : null, ip, kind: 'manual' });

        if (user && full) {
          const { meta, body: manualBody } = splitMeta(full);
          const title = (meta && meta.product) || subject || 'Manual';
          await admin.from('manuals').insert({
            user_id: user.id,
            title,
            type: (meta && meta.type) || 'synthesized',
            body: manualBody || full,
            meta: meta || null,
            official_manual: (meta && meta.officialManual) || null,
          });
        }

        send({ stage: 'done' });
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
