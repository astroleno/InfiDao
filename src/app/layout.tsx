import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: '六经注我 - 以此刻一念进入经典',
  description: '输入一念，读经典如何回应当下处境，再沿注语继续深入原文',
  keywords: ['六经注我', '经典注释', '论语', '孟子', '大学', '中庸', '国学', '阅读'],
  authors: [{ name: 'InfiDao Team' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: '六经注我 - 以此刻一念进入经典',
    description: '输入一念，读经典如何回应当下处境',
    type: 'website',
    locale: 'zh_CN',
    url: 'https://infidao.com',
    siteName: '六经注我'
  },
  twitter: {
    card: 'summary',
    title: '六经注我 - 以此刻一念进入经典',
    description: '输入一念，读经典如何回应当下处境'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#15110f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* DNS prefetch for performance */}
        <link rel="dns-prefetch" href="//api.openai.com" />
        <link rel="dns-prefetch" href="//cdn.jsdelivr.net" />
      </head>

      <body className="antialiased" suppressHydrationWarning>
        <ErrorBoundary>
          <ThemeProvider>
            <div className="min-h-screen min-h-[100dvh]">
              {children}
            </div>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
