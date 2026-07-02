import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: 'weekly', priority: 1 },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await supabase
        .from('manuals')
        .select('public_slug, published_at')
        .not('public_slug', 'is', null)
        .order('published_at', { ascending: false })
        .limit(5000);
      for (const m of data || []) {
        if (!m.public_slug) continue;
        entries.push({
          url: site + '/m/' + m.public_slug,
          lastModified: m.published_at || undefined,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    } catch {
      // sitemap still valid with just the home page
    }
  }
  return entries;
}
