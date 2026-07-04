import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Return the caller's team context (team, members, role, pending invites).
export async function GET() {
  if (!DB_ENABLED) return NextResponse.json({ team: null });
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ team: null, signedIn: false });

    const admin = adminClient();
    const { data: membership } = await admin
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return NextResponse.json({ team: null, signedIn: true, me: user.id });

    const { data: team } = await admin
      .from('teams')
      .select('id, name, seats, status, current_period_end, owner_id')
      .eq('id', membership.team_id)
      .single();

    const { data: memberRows } = await admin
      .from('team_members')
      .select('user_id, role, created_at')
      .eq('team_id', membership.team_id)
      .order('created_at', { ascending: true });

    const ids = (memberRows || []).map((m: any) => m.user_id);
    const { data: profiles } = await admin.from('profiles').select('id, email, plan').in('id', ids);
    const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
    const members = (memberRows || []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      email: byId.get(m.user_id)?.email || '',
      plan: byId.get(m.user_id)?.plan || 'free',
    }));

    const isOwner = membership.role === 'owner';
    let invites: any[] = [];
    if (isOwner) {
      const { data: inv } = await admin
        .from('team_invites')
        .select('id, email, token, created_at')
        .eq('team_id', membership.team_id)
        .order('created_at', { ascending: true });
      invites = inv || [];
    }

    return NextResponse.json({ signedIn: true, me: user.id, team, role: membership.role, isOwner, members, invites });
  } catch (e: any) {
    return NextResponse.json({ team: null, error: e?.message || 'error' }, { status: 500 });
  }
}

// Create a team (caller becomes owner). Fails if the caller is already in a team.
export async function POST(req: Request) {
  if (!DB_ENABLED) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const name = (body.name || 'My Team').toString().trim().slice(0, 60) || 'My Team';

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = adminClient();
  const { data: existing } = await admin
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You are already in a team.' }, { status: 400 });

  const { data: team, error } = await admin
    .from('teams')
    .insert({ owner_id: user.id, name })
    .select('id, name, seats, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
  return NextResponse.json({ team });
}
