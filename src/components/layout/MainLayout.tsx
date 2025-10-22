import { ReactNode } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 font-classic">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Global Loading Overlay */}
      <div id="global-loading" className="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6 shadow-xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">正在处理...</p>
        </div>
      </div>
    </div>
  );
}