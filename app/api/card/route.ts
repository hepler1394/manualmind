import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY.' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const title = (body.manualTitle || 'this item').toString();
  const manualBody = (body.manualBody || '').toString().slice(0, 12000);
  if (!manualBody) return NextResponse.json({ error: 'No manual to summarize.' }, { status: 400 });

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    messages: [
      {
        role: 'user',
        content:
          'From the manual below, produce a QUICK-START CARD that fits on a single printed page for "' +
          title +
          '". Output Markdown only. Include: a one-line summary; a "Quick Steps" numbered list of the 5-8 most essential steps (short, imperative); a "Watch out" bullet list of 2-4 key warnings or common mistakes; and if relevant a one-line safety note. Be concise and skimmable, no fluff.\n\nMANUAL:\n' +
          manualBody,
      },
    ],
  });
  const card = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
  return NextResponse.json({ card, title });
}
