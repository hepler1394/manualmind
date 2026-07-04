import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = (body.token || '').toString().trim();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = adminClient();
  const { data: invite } = await admin
    .from('team_invites')
    .select('id, team_id, email')
    .eq('token', token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 });

  const { data: existing } = await admin
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You are already in a team.' }, { status: 400 });

  const { data: team } = await admin
    .from('teams')
    .select('id, name, seats, status')
    .eq('id', invite.team_id)
    .single();

  const { count: memberCount } = await admin
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', invite.team_id);
  if ((memberCount || 0) >= (team?.seats || 5)) {
    return NextResponse.json({ error: 'This team is full.' }, { status: 400 });
  }

  const { error } = await admin
    .from('team_members')
    .insert({ team_id: invite.team_id, user_id: user.id, role: 'member' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('team_invites').delete().eq('id', invite.id);

  // If the team is already paid, grant Pro immediately.
  if (team?.status === 'active') {
    await admin.from('profiles').update({ plan: 'pro' }).eq('id', user.id);
  }

  return NextResponse.json({ ok: true, team });
}
