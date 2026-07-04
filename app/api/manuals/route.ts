import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Save a manual the user is viewing (shared link, device-local, or example) to their profile.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = (body.title || '').toString().trim().slice(0, 200);
  const manualBody = (body.body || '').toString().slice(0, 200_000);
  if (!title || !manualBody) {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data, error } = await supabase
    .from('manuals')
    .insert({
      user_id: user.id,
      title,
      type: (body.type || 'synthesized').toString().slice(0, 40),
      body: manualBody,
      meta: body.meta && typeof body.meta === 'object' ? body.meta : null,
      official_manual:
        body.meta && typeof body.meta === 'object' && body.meta.officialManual
          ? String(body.meta.officialManual).slice(0, 2000)
          : null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
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

  const space_id = body.space_id === null || body.space_id === '' ? null : body.space_id;
  const { error } = await supabase
    .from('manuals')
    .update({ space_id })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
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

  const { error } = await supabase.from('manuals').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
