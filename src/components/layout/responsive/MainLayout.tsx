import { ReactNode } from 'react';
import { Footer } from '../Footer';
import { Header } from './Header';

interface ResponsiveMainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

export function ResponsiveMainLayout({ children }: ResponsiveMainLayoutProps) {
  return (
    <div className="min-h-screen min-h-[100dvh] ritual-shell text-paper">
      <Header onMenuToggle={() => undefined} showMenuButton={false} />

      <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
