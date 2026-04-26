export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-stone-800 bg-ink text-stone-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 flex items-center">
              <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg border border-zen/40 bg-stone-950 text-zen">
                <span className="font-bold">六</span>
              </div>
              <h3 className="text-lg font-bold text-paper font-classic">六经注我</h3>
            </div>
            <p className="max-w-md text-sm leading-7">
              MVP 聚焦一条完整路径：搜索、注我、延伸探索、返回与重置。
            </p>
          </div>

          <div className="text-sm text-stone-500">
            © {currentYear} 六经注我. MVP reboot.
          </div>
        </div>
      </div>
    </footer>
  );
}
