import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Tối Nay Lọ Gì?',
  applicationName: 'Tối Nay Lọ Gì?',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tối Nay Lọ Gì?',
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/brand/favicon-cs-v2.png',
    shortcut: '/favicon.ico?v=cs-v2',
    apple: '/brand/apple-touch-icon-cs-v2.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#10191e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
