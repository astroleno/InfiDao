interface HeaderProps {
  onMenuToggle: () => void;
  showMenuButton: boolean;
}

export function Header({ onMenuToggle, showMenuButton }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-ink/92 shadow-sm backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            {showMenuButton && (
              <button
                id="sidebar-toggle"
                type="button"
                aria-label="打开经典目录"
                onClick={onMenuToggle}
                className="mr-3 border border-stone-800 p-2 text-stone-400 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink lg:hidden"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            <div className="flex items-center">
              <div className="mr-3 flex h-9 w-9 items-center justify-center border border-zen/45 bg-stone-950 text-lg font-bold text-zen">
                <span>六</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-paper font-classic">六经注我</h1>
                <p className="text-xs tracking-[0.18em] text-stone-500">以此刻一念入经</p>
              </div>
              <div className="sm:hidden">
                <h1 className="text-lg font-bold text-paper font-classic">六经注我</h1>
              </div>
            </div>
          </div>

          <div className="hidden border-b border-stone-700 pb-1 text-xs tracking-[0.22em] text-stone-500 sm:block">
            阅读路径
          </div>
        </div>
      </div>
    </header>
  );
}
