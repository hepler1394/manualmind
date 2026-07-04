import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Remove a member (owner removing someone, or a member leaving).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get('userId');
  if (!targetId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = adminClient();
  const { data: caller } = await admin
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!caller) return NextResponse.json({ error: 'You are not in a team.' }, { status: 400 });

  const isOwner = caller.role === 'owner';
  const removingSelf = targetId === user.id;
  if (!isOwner && !removingSelf) {
    return NextResponse.json({ error: 'Only the owner can remove others.' }, { status: 403 });
  }
  if (isOwner && removingSelf) {
    return NextResponse.json(
      { error: 'The owner cannot leave. Cancel the team subscription instead.' },
      { status: 400 },
    );
  }

  // Ensure the target is in the caller's team.
  const { data: target } = await admin
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', targetId)
    .maybeSingle();
  if (!target || target.team_id !== caller.team_id) {
    return NextResponse.json({ error: 'That person is not in your team.' }, { status: 400 });
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the owner.' }, { status: 400 });
  }

  await admin.from('team_members').delete().eq('user_id', targetId).eq('team_id', caller.team_id);
  // Removed members lose the team's Pro grant.
  await admin.from('profiles').update({ plan: 'free' }).eq('id', targetId);

  return NextResponse.json({ ok: true });
}
