import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function dueDate(intervalDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ reminders: [] });
  const { data } = await supabase
    .from('reminders')
    .select('id, manual_id, label, interval_days, next_due')
    .order('next_due', { ascending: true });
  return NextResponse.json({ reminders: data || [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const label = (body.label || '').toString().trim();
  let interval = parseInt(body.interval_days, 10);
  if (!Number.isFinite(interval) || interval < 1) interval = 90;
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: user.id,
      manual_id: body.manual_id || null,
      label: label.slice(0, 120),
      interval_days: interval,
      next_due: dueDate(interval),
    })
    .select('id, manual_id, label, interval_days, next_due')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Mark done: reschedule next_due by the interval.
  const { data: existing } = await supabase
    .from('reminders')
    .select('interval_days')
    .eq('id', id)
    .single();
  const interval = (existing && existing.interval_days) || 90;
  const { error } = await supabase
    .from('reminders')
    .update({ next_due: dueDate(interval) })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, next_due: dueDate(interval) });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
