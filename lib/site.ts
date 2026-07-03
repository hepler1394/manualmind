// Canonical site origin for SEO surfaces (public pages, sitemap, robots).
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : '') ||
    (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '') ||
    'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
