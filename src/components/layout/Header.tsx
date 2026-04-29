export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800 bg-ink/90 shadow-sm backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl border border-zen/40 bg-stone-950 text-xl font-bold text-zen shadow-lg">
              <span>六</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-paper font-classic">六经注我</h1>
              <p className="text-xs font-medium tracking-[0.18em] text-stone-500">搜索 · 注我 · 回响路径</p>
            </div>
          </div>

          <div className="hidden rounded-full border border-stone-800 px-3 py-1.5 text-xs tracking-[0.2em] text-stone-500 sm:block">
            MVP 闭环
          </div>
        </div>
      </div>
    </header>
  );
}
