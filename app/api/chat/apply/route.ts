import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';

// "Add this fix to the manual": after a follow-up chat solves something, merge
// that insight into the manual itself — usually Troubleshooting or Tips — so
// the manual gets smarter every time it's used.
export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Not configured.' }, { status: 500 });

  const payload = await req.json().catch(() => ({}));
  const id = payload.id;
  const question = (payload.question || '').toString().slice(0, 2000);
  const answer = (payload.answer || '').toString().slice(0, 8000);
  if (!id || !question || !answer) {
    return NextResponse.json({ error: 'Missing id, question, or answer' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: manual } = await supabase
    .from('manuals')
    .select('id, title, body')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!manual) return NextResponse.json({ error: 'Manual not found' }, { status: 404 });

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      'You are ManualMind\'s manual editor. You receive a manual (markdown) plus one solved Q&A from its follow-up chat. ' +
      'Merge the useful insight from the Q&A into the manual with the smallest sensible change: usually one new bullet or short paragraph in Troubleshooting or Tips & Common Mistakes (create the section only if it is missing). ' +
      'Match the manual\'s tone and formatting. Do not rewrite unrelated sections, do not remove content, do not add commentary. ' +
      'If the Q&A contains nothing worth adding, return the manual unchanged. ' +
      'Reply with ONLY the complete updated manual markdown — no preamble, no code fence around the whole document.',
    messages: [
      {
        role: 'user',
        content:
          'MANUAL TITLE: ' + manual.title +
          '\n\nMANUAL BODY:\n\n' + String(manual.body).slice(0, 60_000) +
          '\n\n---\nSOLVED CHAT EXCHANGE\nUser asked: ' + question +
          '\nAssistant answered: ' + answer,
      },
    ],
  });

  const updated = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
  if (!updated || updated.length < 200) {
    return NextResponse.json({ error: 'Could not merge the fix.' }, { status: 500 });
  }

  const changed = updated !== String(manual.body).trim();
  if (changed) {
    // AI-merged content keeps the verified badge (same trust level as generation).
    const { error } = await supabase
      .from('manuals')
      .update({ body: updated })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ body: updated, changed });
}
