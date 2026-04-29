import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: '六经注我 - AI智能经典注释系统',
  description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话，探索中华经典的现代价值',
  keywords: ['六经注我', '经典注释', '人工智能', '论语', '孟子', '大学', '中庸', '国学'],
  authors: [{ name: 'InfiDao Team' }],
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: '六经注我 - AI智能经典注释系统',
    description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话',
    type: 'website',
    locale: 'zh_CN',
    url: 'https://infidao.com',
    siteName: '六经注我'
  },
  twitter: {
    card: 'summary',
    title: '六经注我 - AI智能经典注释系统',
    description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
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
