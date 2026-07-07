import type { Metadata, Viewport } from 'next';
import { Inter, Anton, Caveat } from 'next/font/google';
import { siteUrl } from '@/lib/site';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-inter', display: 'swap' });
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton', display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-caveat', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'ManualMind — the manual for anything',
    template: '%s — ManualMind',
  },
  description:
    'Find the official manual for anything — or get a better one built live from official docs, community forums, expert sites, and video tutorials. Type it, snap a photo, or upload a PDF.',
  manifest: '/manifest.webmanifest',
  applicationName: 'ManualMind',
  appleWebApp: { capable: true, title: 'ManualMind', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.svg', apple: '/icon.svg', shortcut: '/icon.svg' },
  keywords: [
    'manual', 'user guide', 'instructions', 'how to', 'fix', 'troubleshooting',
    'error code', 'official manual', 'AI manual generator',
  ],
  authors: [{ name: 'ManualMind' }],
  creator: 'ManualMind',
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: 'ManualMind',
    locale: 'en_US',
    title: 'ManualMind — the manual for anything',
    description:
      'Find the official manual for anything — or get a better one built live from official docs, community forums, expert sites, and video tutorials.',
  },
  twitter: {
    card: 'summary',
    title: 'ManualMind — the manual for anything',
    description:
      'Find the official manual for anything — or get a better one built live from official docs and community knowledge.',
  },
  robots: { index: true, follow: true },
  // Site ships its own deliberate dark design; tells Dark Reader not to repaint it.
  other: { 'darkreader-lock': 'true' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${caveat.variable}`}>
      <body>
        {/* Apply the saved theme before paint so there's no flash of the default theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('mm_theme');if(t==='blueprint'||t==='terminal'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
