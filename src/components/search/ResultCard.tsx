import { SearchResult } from '@/types';

interface ResultCardProps {
  result: SearchResult;
  query: string;
  index: number;
  onAnnotate: (passageId: string, passageText: string) => void;
  isAnnotating: boolean;
  isSelected: boolean;
}

export function ResultCard({
  result,
  query,
  index,
  onAnnotate,
  isAnnotating,
  isSelected,
}: ResultCardProps) {
  const resonance = Math.round(result.score * 100);

  const matchLine =
    result.score >= 0.85
      ? "这一句几乎正中你此刻的问题。"
      : result.score >= 0.65
        ? "这一句与此念已经同频，可以继续深入。"
        : "这是一条较轻的呼应，适合当作另一种进入方式。";

  return (
    <article
      className={`mx-auto w-full max-w-3xl px-6 py-12 text-center md:px-10 md:py-16 motion-safe:animate-ritual-reveal ${
        isSelected
          ? 'border border-zen/80 bg-stone-950/82 shadow-[0_0_0_1px_rgba(199,179,139,0.25)]'
          : 'border border-stone-800/80 bg-stone-950/68'
      }`}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="mb-10">
        <span className="border-b border-zen/25 pb-1 text-xs tracking-[0.28em] text-zen font-classic">
          {result.source} · {result.chapter} · 第 {result.section} 节
        </span>
      </div>

      <div className="relative mb-10 min-h-[8rem] px-2">
        <span className="absolute -left-1 top-0 text-5xl text-stone-800/50 font-classic">“</span>
        <blockquote className="px-6 text-3xl leading-relaxed text-paper font-classic md:px-12 md:text-5xl md:leading-[1.6]">
          {result.text}
        </blockquote>
        <span className="absolute -right-1 bottom-0 text-5xl text-stone-800/50 font-classic">”</span>
      </div>

      <div className="mx-auto max-w-xl">
        <p className="text-lg leading-8 text-stone-400 italic font-classic">
          与“{query}”的呼应度为 {resonance}%。
        </p>
        <p className="mt-3 text-sm leading-7 tracking-[0.08em] text-stone-500">{matchLine}</p>
      </div>

      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => onAnnotate(result.id, result.text)}
          disabled={isAnnotating && isSelected}
          className="inline-flex min-w-44 items-center justify-center rounded-full border border-stone-700 px-6 py-3 text-sm tracking-[0.25em] text-stone-200 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
        >
          {isAnnotating && isSelected ? "注我中" : "进入注我"}
        </button>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="h-16 w-px bg-gradient-to-b from-stone-700 to-transparent opacity-60" />
      </div>

      {isSelected && (
        <div className="mt-4 text-xs tracking-[0.2em] text-zen/80">当前正在为这一句请求注释</div>
      )}
    </article>
  );
}
