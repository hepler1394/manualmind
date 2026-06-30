import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';

type RedditPost = {
  title: string;
  subreddit: string;
  score: number;
  url: string;
  body: string;
};

// Pull real community discussion straight from Reddit's free public JSON API.
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

// Use Claude vision to name the exact product in an uploaded photo.
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
  const text = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join(' ')
    .trim();
  return text || hint;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const encoder = new TextEncoder();

  const body = await req.json().catch(() => ({}));
  const query: string = (body.query || '').toString().trim();
  const image: string | undefined = body.image;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));

      try {
        if (!apiKey) {
          send({
            stage: 'error',
            message:
              'No ANTHROPIC_API_KEY is set on the server. Add it in Vercel under Project Settings to Environment Variables, then redeploy.',
          });
          controller.close();
          return;
        }
        if (!query && !image) {
          send({ stage: 'error', message: 'Type something or upload a photo first.' });
          controller.close();
          return;
        }

        const client = new Anthropic({ apiKey });

        // 1. Identify from image if provided.
        let subject = query;
        if (image) {
          send({ stage: 'identify' });
          subject = await identifyImage(client, image, query);
          send({ stage: 'identified', product: subject });
        }

        // 2. Pull Reddit context (real community knowledge).
        send({ stage: 'reddit' });
        const reddit = await fetchReddit(subject);
        send({ stage: 'reddit_done', count: reddit.length });

        const redditContext =
          reddit.length > 0
            ? reddit
                .map(
                  (p, i) =>
                    '[' +
                    (i + 1) +
                    '] ' +
                    p.title +
                    ' (' +
                    p.subreddit +
                    ', ' +
                    p.score +
                    ' upvotes) ' +
                    p.url +
                    (p.body ? ('\n    ' + p.body.replace(/\s+/g, ' ').slice(0, 600)) : ''),
                )
                .join('\n')
            : '(no Reddit threads found)';

        const system =
          'You are ManualMind, an expert technical-manual engine. Produce the single most useful manual for the item the user needs help with.';

        const userPrompt =
          'The user needs a manual or guide for: "' +
          subject +
          '".\n\n' +
          'Reddit community discussions found (real-world tips, gotchas, fixes — cite the most useful):\n' +
          redditContext +
          '\n\nInstructions:\n' +
          '1. Use web_search to find the OFFICIAL manufacturer manual, user guide, datasheet, or PDF for this item if one plausibly exists. Search smartly (model number + "manual" / "user guide" / "pdf").\n' +
          '2. Begin your reply with ONE fenced code block tagged meta containing minified JSON: {"product":"<best name>","officialManual":"<direct URL or empty>","type":"official|community|synthesized","confidence":"high|medium|low"}. Use "official" if you found a real manufacturer manual, "community" if mostly from Reddit/forums, "synthesized" if written from general knowledge.\n' +
          '3. After the meta block, write a clear Markdown manual: a one-line summary, then sections like Overview, What You Need, Step-by-Step, Tips & Common Mistakes (pull from Reddit where useful), Troubleshooting, and Safety if relevant. Be specific and practical — real model details, not filler.\n' +
          '4. End with a "## Sources" section listing every official link and Reddit thread you actually used, as markdown links.\n\n' +
          'Prefer verified facts from the official manual over guesses.';

        send({ stage: 'generate' });

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
            send({ stage: 'token', text: (event as any).delta.text });
          }
        }

        send({ stage: 'done' });
      } catch (e: any) {
        send({ stage: 'error', message: (e && e.message) ? e.message : String(e) });
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
