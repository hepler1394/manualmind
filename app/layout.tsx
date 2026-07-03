import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ManualMind — a manual for anything',
  description:
    'AI that finds the official manual for anything, or builds one in real time from Reddit and the web. Upload a photo or just type.',
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
