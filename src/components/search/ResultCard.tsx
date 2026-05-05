import { SearchResult } from '@/types';

interface ResultCardProps {
  result: SearchResult;
  index: number;
  onAnnotate: (passageId: string, passageText: string) => void;
  isAnnotating: boolean;
  pendingAnnotationPassageId: string | null;
  isSelected: boolean;
  hasCompletedAnnotation: boolean;
}

export function ResultCard({
  result,
  index,
  onAnnotate,
  isAnnotating,
  pendingAnnotationPassageId,
  isSelected,
  hasCompletedAnnotation,
}: ResultCardProps) {
  const chapterLabelId = `${result.id}-chapter-label`;
  const isPendingAnnotationTarget = pendingAnnotationPassageId === result.id;
  const actionLabel = isPendingAnnotationTarget
    ? "注我中"
    : isAnnotating
      ? "请稍候"
      : hasCompletedAnnotation
        ? "回到注语"
        : "进入注我";
  const resonanceLabel =
    result.score >= 0.85
      ? "正中此念"
      : result.score >= 0.65
        ? "可深读"
        : "旁通一义";

  const matchLine =
    result.score >= 0.85
      ? "这一句几乎贴住你此刻的一念。"
      : result.score >= 0.65
        ? "这一句值得停下深读，再看它如何回应你。"
        : "这一句从旁处相通，适合作为另一种入口。";

  return (
    <article
      aria-label={`${result.source}${result.chapter}第${result.section}节，${resonanceLabel}`}
      className={`mx-auto w-full max-w-3xl px-5 py-10 text-center md:px-10 md:py-16 motion-safe:animate-ritual-reveal ${
        isSelected
          ? 'border-y border-zen/80 bg-stone-950/82 shadow-[0_0_0_1px_rgba(199,179,139,0.18)] md:border'
          : 'border-y border-stone-800/80 bg-stone-950/58 md:border'
      }`}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="mb-10">
        <span
          id={chapterLabelId}
          className="border-b border-zen/25 pb-1 text-xs tracking-[0.28em] text-zen font-classic"
        >
          {result.source} · {result.chapter} · 第 {result.section} 节
        </span>
      </div>

      <div className="relative mb-10 min-h-[8rem] px-4">
        <span className="absolute -left-1 -top-2 text-4xl text-stone-800/50 font-classic md:text-5xl">“</span>
        <blockquote className="px-5 text-2xl leading-[1.85] text-paper font-classic md:px-12 md:text-4xl md:leading-[1.65]">
          {result.text}
        </blockquote>
        <span className="absolute -right-1 -bottom-3 text-4xl text-stone-800/50 font-classic md:text-5xl">”</span>
      </div>

      <div className="mx-auto max-w-xl">
        <p className="text-lg leading-8 text-stone-300 italic font-classic">
          {resonanceLabel}
        </p>
        <p className="mt-3 text-sm leading-7 tracking-[0.08em] text-stone-500">{matchLine}</p>
      </div>

      <div className="mt-10 flex justify-center">
        <button
          id={`annotation-action-${result.id}`}
          type="button"
          onClick={() => onAnnotate(result.id, result.text)}
          aria-describedby={chapterLabelId}
          disabled={isAnnotating}
          className="inline-flex min-w-44 items-center justify-center rounded-full border border-stone-700 px-6 py-3 text-sm tracking-[0.25em] text-stone-200 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600 disabled:active:scale-100"
        >
          {actionLabel}
        </button>
      </div>

      <div className="mt-12 flex justify-center">
        <div className="h-16 w-px bg-gradient-to-b from-stone-700 to-transparent opacity-60" />
      </div>

      {isSelected && (
        <div className="mt-4 text-xs tracking-[0.2em] text-zen/80">
          {isPendingAnnotationTarget
            ? "取义中，此句暂不可重复进入"
            : hasCompletedAnnotation
              ? "当前注语已展开，可沿此句继续进入下一层回响"
              : "当前结果已选中"}
        </div>
      )}
    </article>
  );
}
