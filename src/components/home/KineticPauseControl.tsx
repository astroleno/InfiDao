interface KineticPauseControlProps {
  paused: boolean;
  reducedMotion: boolean;
  onToggle: () => void;
}

export function KineticPauseControl({
  paused,
  reducedMotion,
  onToggle,
}: KineticPauseControlProps) {
  if (reducedMotion) {
    return (
      <p className="min-h-11 px-3 py-3 text-xs tracking-[0.18em] text-stone-500">
        静态文字场
      </p>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center justify-center border border-stone-700/80 bg-ink/78 px-4 py-3 text-xs tracking-[0.2em] text-stone-300 backdrop-blur transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
    >
      {paused ? "继续文字场" : "暂停文字场"}
    </button>
  );
}
