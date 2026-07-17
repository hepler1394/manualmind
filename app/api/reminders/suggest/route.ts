import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Extracting maintenance intervals from a manual is Haiku-grade work.
const MODEL = 'claude-haiku-4-5-20251001';

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ suggestions: [] });

  const body = await req.json().catch(() => ({}));
  const title = (body.manualTitle || 'this item').toString();
  const manualBody = (body.manualBody || '').toString().slice(0, 8000);

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content:
            'Suggest 2-4 recurring maintenance tasks for "' +
            title +
            '" based on the manual below. Return ONLY minified JSON: an array like [{"label":"Replace water filter","interval_days":180}]. interval_days is a positive integer. No prose, no code fences.\n\nMANUAL:\n' +
            manualBody,
        },
      ],
    });
    const text = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    let suggestions: any[] = [];
    if (start >= 0 && end > start) {
      try {
        suggestions = JSON.parse(text.slice(start, end + 1));
      } catch {
        suggestions = [];
      }
    }
    suggestions = (Array.isArray(suggestions) ? suggestions : [])
      .filter((s) => s && s.label)
      .slice(0, 4)
      .map((s) => ({
        label: String(s.label).slice(0, 120),
        interval_days: Number.isFinite(parseInt(s.interval_days, 10)) ? parseInt(s.interval_days, 10) : 90,
      }));
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
