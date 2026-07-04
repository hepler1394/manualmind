import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ManualMind — the manual for anything',
    short_name: 'ManualMind',
    description:
      'Find the official manual for anything — or get a better one built live from official docs, community forums, and video tutorials.',
    start_url: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    categories: ['utilities', 'productivity', 'education'],
    lang: 'en',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
