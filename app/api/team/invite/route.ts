import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { randomToken } from '@/lib/team';

export const runtime = 'nodejs';

async function sendInviteEmail(to: string, url: string, teamName: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  if (!key || !from) return false;
  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1d1d1f;">' +
    '<h1 style="font-size:22px;letter-spacing:-0.4px;margin:0 0 6px;">You are invited to ' +
    teamName.replace(/</g, '&lt;') +
    '</h1>' +
    '<p style="color:#6e6e73;font-size:15px;margin:0 0 18px;">Join this ManualMind team to get Pro access — unlimited manuals and quick-start cards.</p>' +
    '<a href="' +
    url +
    '" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:999px;">Accept invite</a>' +
    '</div>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: 'Join ' + teamName + ' on ManualMind', html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = (body.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const admin = adminClient();
  const { data: team } = await admin
    .from('teams')
    .select('id, name, seats, owner_id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: 'Only the team owner can invite.' }, { status: 403 });

  // Seat check: current members + pending invites must stay under the seat count.
  const { count: memberCount } = await admin
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', team.id);
  const { count: inviteCount } = await admin
    .from('team_invites')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', team.id);
  if ((memberCount || 0) + (inviteCount || 0) >= team.seats) {
    return NextResponse.json({ error: 'No seats left. Increase seats to invite more.' }, { status: 400 });
  }

  const token = randomToken();
  const { error } = await admin
    .from('team_invites')
    .insert({ team_id: team.id, email, token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://manualmind-six.vercel.app';
  const inviteUrl = origin + '/team?invite=' + token;
  const emailed = await sendInviteEmail(email, inviteUrl, team.name);

  return NextResponse.json({ ok: true, inviteUrl, emailed });
}
