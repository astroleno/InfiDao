import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '六经注我 - AI智能经典注释系统',
  description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话，探索中华经典的现代价值',
  keywords: ['六经注我', '经典注释', '人工智能', '论语', '孟子', '大学', '中庸', '国学'],
  authors: [{ name: 'InfiDao Team' }],
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' }
  ],
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: '六经注我 - AI智能经典注释系统',
    description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话',
    type: 'website',
    locale: 'zh_CN',
    url: 'https://infidao.com',
    siteName: '六经注我',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '六经注我 - AI智能经典注释系统'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: '六经注我 - AI智能经典注释系统',
    description: '通过人工智能技术，实现"我注六经，六经注我"的智慧对话',
    images: ['/og-image.png']
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* DNS prefetch for performance */}
        <link rel="dns-prefetch" href="//api.openai.com" />
        <link rel="dns-prefetch" href="//cdn.jsdelivr.net" />
      </head>

      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <ErrorBoundary>
          <ThemeProvider>
            <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
              {children}
            </div>
          </ThemeProvider>
        </ErrorBoundary>

        {/* Performance monitoring and analytics */}
        {process.env.NODE_ENV === 'production' && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  // Performance monitoring
                  if ('requestIdleCallback' in window) {
                    requestIdleCallback(() => {
                      // Load analytics scripts
                      const script = document.createElement('script');
                      script.src = '/analytics.js';
                      script.async = true;
                      document.head.appendChild(script);
                    });
                  }
                `
              }}
            />
          </>
        )}

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                      console.log('SW registered: ', registration);
                    })
                    .catch((registrationError) => {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}