// Free-tier limits. Pro is unlimited (fair use).
export const FREE_MONTHLY_MANUALS = 5;
export const ANON_DAILY_MANUALS = 3;

export function isPro(plan: string | null | undefined): boolean {
  return plan === 'pro';
}
