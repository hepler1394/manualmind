import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ManualMind — the manual for anything',
    short_name: 'ManualMind',
    description:
      'Find the official manual for anything — or get a better one built live from Reddit, the web, and YouTube.',
    start_url: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    categories: ['utilities', 'productivity', 'education'],
    lang: 'en',
    background_color: '#f5f5f7',
    theme_color: '#f5f5f7',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
