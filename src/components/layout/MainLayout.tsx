import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen min-h-[100dvh] ritual-shell text-paper font-classic">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      <Footer />

      <div id="global-loading" className="fixed inset-0 z-50 hidden items-center justify-center bg-ink/72">
        <div className="border border-stone-800 bg-stone-950/90 p-6 shadow-xl">
          <div className="mx-auto h-12 w-12 rounded-full border-b-2 border-zen motion-safe:animate-spin"></div>
          <p className="mt-4 text-stone-400">正在处理...</p>
        </div>
      </div>
    </div>
  );
}
