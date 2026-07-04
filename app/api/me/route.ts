import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { FREE_MONTHLY_MANUALS, isPro } from '@/lib/plan';

export const runtime = 'nodejs';

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function monthStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function GET() {
  if (!DB_ENABLED) return NextResponse.json({ signedIn: false });

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ signedIn: false });

    const admin = adminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('plan, current_period_end')
      .eq('id', user.id)
      .single();
    const plan = profile?.plan || 'free';

    const { count } = await admin
      .from('usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'manual')
      .gte('created_at', monthStartISO());

    const { data: manuals } = await supabase
      .from('manuals')
      .select('id, title, type, body, meta, official_manual, space_id, public_slug, verified, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: spaces } = await supabase
      .from('spaces')
      .select('id, name, created_at')
      .order('created_at', { ascending: true });

    const { data: reminders } = await supabase
      .from('reminders')
      .select('id, manual_id, label, interval_days, next_due')
      .order('next_due', { ascending: true });

    return NextResponse.json({
      signedIn: true,
      email: user.email,
      plan,
      usedThisMonth: count || 0,
      limit: isPro(plan) ? null : FREE_MONTHLY_MANUALS,
      manuals: manuals || [],
      spaces: spaces || [],
      reminders: reminders || [],
    });
  } catch {
    return NextResponse.json({ signedIn: false });
  }
}
