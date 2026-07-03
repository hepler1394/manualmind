import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
    .select('id, title, public_slug, body')
    .eq('id', id)
    .single();
  if (!manual) return NextResponse.json({ error: 'Manual not found' }, { status: 404 });
  if (manual.public_slug) return NextResponse.json({ slug: manual.public_slug });
  if (!manual.body || manual.body.length < 200)
    return NextResponse.json(
      { error: 'This manual is too short to publish — generate a fuller one first.' },
      { status: 400 },
    );

  // Retry on the (unlikely) slug collision instead of failing the publish.
  let slug = '';
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    slug = slugify(manual.title) + '-' + Math.random().toString(36).slice(2, 8);
    const { error } = await supabase
      .from('manuals')
      .update({ public_slug: slug, published_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      revalidatePath('/library');
      revalidatePath('/m/' + slug);
      return NextResponse.json({ slug });
    }
    lastError = error;
    if (!/duplicate|unique/i.test(error.message || '')) break;
  }
  return NextResponse.json(
    { error: 'Could not publish. If self-hosting, run supabase/phase4.sql first.' },
    { status: 500 },
  );
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

  const { data: existing } = await supabase.from('manuals').select('public_slug').eq('id', id).single();
  const { error } = await supabase
    .from('manuals')
    .update({ public_slug: null, published_at: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/library');
  if (existing?.public_slug) revalidatePath('/m/' + existing.public_slug);
  return NextResponse.json({ ok: true });
}
