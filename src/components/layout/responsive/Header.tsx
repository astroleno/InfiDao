import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface HeaderProps {
  onMenuToggle: () => void;
  showMenuButton: boolean;
}

export function Header({ onMenuToggle, showMenuButton }: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left Section */}
          <div className="flex items-center">
            {/* Mobile Menu Button */}
            {showMenuButton && (
              <Button
                id="sidebar-toggle"
                variant="ghost"
                size="sm"
                onClick={onMenuToggle}
                className="mr-3 lg:hidden"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Button>
            )}

            {/* Logo */}
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold text-lg">六</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-gray-900 font-classic">六经注我</h1>
                <p className="text-xs text-gray-600">AI智能经典注释</p>
              </div>
              <div className="sm:hidden">
                <h1 className="text-lg font-bold text-gray-900 font-classic">六经注我</h1>
              </div>
            </div>
          </div>

          {/* Center Section - Desktop Search */}
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="搜索经典智慧..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-3">
            {/* Mobile Search Button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </Button>
            </div>

            {/* Notifications */}
            <div className="hidden sm:block">
              <Button variant="ghost" size="sm" className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </Button>
            </div>

            {/* User Menu */}
            <div className="relative">
              <Button variant="ghost" size="sm">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">用</span>
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Search Bar */}
        {isSearchOpen && (
          <div className="md:hidden py-3 border-t border-gray-200">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索经典智慧..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}