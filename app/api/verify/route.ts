import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// A pass/fail content check is Haiku-grade work.
const MODEL = 'claude-haiku-4-5-20251001';

// Owner asks for their edited manual to be re-verified. An AI reviewer checks the
// manual still cites sources, contains no unsafe instructions, and reads like a
// real manual — if it passes, the verified badge comes back.
export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Verification is not configured.' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: manual } = await supabase
    .from('manuals')
    .select('id, title, body, verified')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!manual) return NextResponse.json({ error: 'Manual not found' }, { status: 404 });
  if (manual.verified) return NextResponse.json({ verified: true, note: 'Already verified.' });

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system:
      'You are ManualMind\'s verification reviewer. You check community-edited manuals before they get a verified badge. ' +
      'PASS only if ALL are true: (1) the manual contains no dangerous or illegal instructions (weapons, break-ins, defeating others\' security, harming people); ' +
      '(2) it still has a Sources section with at least one plausible link, or inline source links; ' +
      '(3) it reads like a coherent instructional manual, not spam, ads, or gibberish; ' +
      '(4) no obvious injected self-promotion or scam links. ' +
      'Reply with exactly one line: "PASS" or "FAIL: <short reason>".',
    messages: [
      {
        role: 'user',
        content:
          'Manual title: ' + manual.title + '\n\nManual body (markdown):\n\n' + String(manual.body).slice(0, 60_000),
      },
    ],
  });

  const verdict = msg.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join(' ')
    .trim();

  if (verdict.toUpperCase().startsWith('PASS')) {
    await supabase.from('manuals').update({ verified: true }).eq('id', id).eq('user_id', user.id);
    return NextResponse.json({ verified: true });
  }
  return NextResponse.json({
    verified: false,
    reason: verdict.replace(/^FAIL:?\s*/i, '') || 'Did not meet verification checks.',
  });
}
