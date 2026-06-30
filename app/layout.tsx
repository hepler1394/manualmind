import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ManualMind — a manual for anything',
  description:
    'AI that finds the official manual for anything, or builds one in real time from Reddit and the web. Upload a photo or just type.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
