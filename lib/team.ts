// Helpers for the Team plan. Server-only (uses the service-role admin client).

// Flip every current member's plan (Pro while the team subscription is active).
export async function setTeamMembersPlan(
  admin: any,
  teamId: string,
  plan: 'pro' | 'free',
): Promise<void> {
  const { data: members } = await admin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);
  const ids = (members || []).map((m: any) => m.user_id);
  if (ids.length > 0) {
    await admin.from('profiles').update({ plan }).in('id', ids);
  }
}

// Look up the team a user belongs to (as owner or member), or null.
export async function getUserTeamId(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.team_id || null;
}

export function randomToken(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return (c.randomUUID() + c.randomUUID()).replace(/-/g, '');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
