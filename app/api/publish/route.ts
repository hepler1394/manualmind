import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'manual';
}

export async function POST(req: Request) {
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
    .select('id, title, public_slug')
    .eq('id', id)
    .single();
  if (!manual) return NextResponse.json({ error: 'Manual not found' }, { status: 404 });
  if (manual.public_slug) return NextResponse.json({ slug: manual.public_slug });

  const slug = slugify(manual.title) + '-' + Math.random().toString(36).slice(2, 8);
  const { error } = await supabase
    .from('manuals')
    .update({ public_slug: slug, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error)
    return NextResponse.json(
      { error: 'Could not publish. If self-hosting, run supabase/phase4.sql first.' },
      { status: 500 },
    );
  return NextResponse.json({ slug });
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

  const { error } = await supabase
    .from('manuals')
    .update({ public_slug: null, published_at: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
