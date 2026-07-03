import type { Metadata, Viewport } from 'next';
import { siteUrl } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'ManualMind — the manual for anything',
    template: '%s — ManualMind',
  },
  description:
    'Find the official manual for anything — or get a better one built live from Reddit, the web, and YouTube. Type it, snap a photo, or upload a PDF.',
  manifest: '/manifest.webmanifest',
  applicationName: 'ManualMind',
  appleWebApp: { capable: true, title: 'ManualMind', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon.svg', shortcut: '/icon.svg' },
  // Site ships its own deliberate light design; tells Dark Reader not to repaint it.
  other: { 'darkreader-lock': 'true' },
};

export const viewport: Viewport = {
  themeColor: '#f5f5f7',
  colorScheme: 'only light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
