import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// High-frequency, low-complexity: Haiku keeps follow-up chat snappy and ~10x cheaper.
const MODEL = 'claude-haiku-4-5-20251001';
const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: Request) {
  if (!DB_ENABLED) return NextResponse.json({ messages: [] });
  const { searchParams } = new URL(req.url);
  const manualId = searchParams.get('manualId');
  if (!manualId) return NextResponse.json({ messages: [] });

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ messages: [] });

    const { data } = await supabase
      .from('manual_chats')
      .select('role, content, created_at')
      .eq('manual_id', manualId)
      .order('created_at', { ascending: true });
    return NextResponse.json({ messages: data || [] });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const encoder = new TextEncoder();
  const body = await req.json().catch(() => ({}));
  const manualId: string | undefined = body.manualId;
  const manualTitle: string = (body.manualTitle || 'this item').toString();
  const manualBody: string = (body.manualBody || '').toString().slice(0, 12000);
  const messages: { role: string; content: string }[] = Array.isArray(body.messages)
    ? body.messages
    : [];

  let user: any = null;
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
          send({ stage: 'error', message: 'Server missing ANTHROPIC_API_KEY.' });
          controller.close();
          return;
        }
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');

        const client = new Anthropic({ apiKey });
        const system =
          'You are ManualMind\'s helpful assistant. The user is looking at a manual titled "' +
          manualTitle +
          '". Use it as the primary context and answer their follow-up questions specifically, practically, and concisely. If the manual lacks the answer, you may use web_search. Never invent model-specific steps you are unsure about — say when to consult the official manual or a professional (especially for gas, electrical, or structural work).\n\nMANUAL:\n' +
          manualBody;

        // Cost guards: only the last 12 turns, each capped, travel to the model.
        const convo = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-12)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: (m.content || '').toString().slice(0, 2000),
          }))
          .filter((m) => m.content.length > 0);
        if (convo.length === 0) {
          send({ stage: 'done' });
          controller.close();
          return;
        }

        let full = '';
        const msgStream = client.messages.stream({
          model: MODEL,
          max_tokens: 1500,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as any],
          messages: convo,
        });
        for await (const event of msgStream) {
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

        if (DB_ENABLED && user && manualId && lastUser) {
          try {
            const supabase = createClient();
            await supabase.from('manual_chats').insert([
              { manual_id: manualId, user_id: user.id, role: 'user', content: lastUser.content },
              { manual_id: manualId, user_id: user.id, role: 'assistant', content: full },
            ]);
          } catch {}
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
