import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
// Must never be statically cached — this route sends real emails on real schedules.
export const dynamic = 'force-dynamic';

const DB_ENABLED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailHtml(itemsHtml: string, site: string): string {
  const link = site || 'https://manualmind-six.vercel.app';
  return (
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1d1d1f;">' +
    '<h1 style="font-size:22px;letter-spacing:-0.4px;margin:0 0 4px;">Maintenance due</h1>' +
    '<p style="color:#6e6e73;font-size:15px;margin:0 0 18px;">A few things on your ManualMind devices are due for upkeep:</p>' +
    '<ul style="padding-left:18px;font-size:16px;line-height:1.5;margin:0 0 22px;">' +
    itemsHtml +
    '</ul>' +
    '<a href="' +
    link +
    '" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 20px;border-radius:999px;">Open ManualMind</a>' +
    '<p style="color:#86868b;font-size:12px;margin:26px 0 0;">You are receiving this because you set maintenance reminders in ManualMind. Mark items done in the app to reschedule them.</p>' +
    '</div>'
  );
}

async function sendEmail(
  key: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  // Secure the endpoint when CRON_SECRET is configured (Vercel Cron sends it as a Bearer token).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== 'Bearer ' + secret) return new Response('Unauthorized', { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL;
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';

  if (!DB_ENABLED) return NextResponse.json({ ok: true, skipped: 'db-not-configured' });
  if (!resendKey || !from) return NextResponse.json({ ok: true, skipped: 'email-not-configured' });

  const admin = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch due reminders. Prefer the last_emailed_on guard; fall back if the column is absent.
  let hasGuard = true;
  let res: any = await admin
    .from('reminders')
    .select('id, user_id, manual_id, label, next_due, last_emailed_on')
    .lte('next_due', today);
  if (res.error) {
    hasGuard = false;
    res = await admin
      .from('reminders')
      .select('id, user_id, manual_id, label, next_due')
      .lte('next_due', today);
  }
  const rows: any[] = res.data || [];
  const due = hasGuard ? rows.filter((r) => !r.last_emailed_on || r.last_emailed_on < today) : rows;
  if (due.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Group reminders by user.
  const byUser = new Map<string, any[]>();
  for (const r of due) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id)!.push(r);
  }

  // Look up each user's email.
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await admin.from('profiles').select('id, email').in('id', userIds);
  const emailById = new Map<string, string>();
  for (const p of profiles || []) if (p.email) emailById.set(p.id, p.email);

  let sent = 0;
  const emailedIds: string[] = [];
  for (const [uid, items] of byUser) {
    const to = emailById.get(uid);
    if (!to) continue;
    const itemsHtml = items.map((i) => '<li style="margin:6px 0">' + escapeHtml(i.label) + '</li>').join('');
    const ok = await sendEmail(resendKey, from, to, 'Maintenance due on ManualMind', emailHtml(itemsHtml, site));
    if (ok) {
      sent++;
      for (const i of items) emailedIds.push(i.id);
    }
  }

  // Prevent re-emailing the same due item tomorrow.
  if (hasGuard && emailedIds.length > 0) {
    await admin.from('reminders').update({ last_emailed_on: today }).in('id', emailedIds);
  }

  return NextResponse.json({ ok: true, sent, due: due.length });
}
