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

function buildFitLine(result: SearchResult): string {
  const text = `${result.source} ${result.chapter} ${result.text}`;

  if (/过之|不及|中庸|中和|中节|时中|分寸/u.test(text)) {
    return "适合：当你在过与不及之间摇摆时。";
  }

  if (/止|定|静|安|虑|至善|明德/u.test(text)) {
    return "适合：当你需要先把心和方向定下来时。";
  }

  if (/朋友|交|信|忠|三省|不信/u.test(text)) {
    return "适合：当你想重新校准关系里的真诚与分寸时。";
  }

  if (/学|习|修身|过则勿惮改|传不习/u.test(text)) {
    return "适合：当你要把知道的道理落回行动时。";
  }

  return "适合：当你想从另一面照见此刻处境时。";
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
        ? hasCompletedAnnotation
          ? "续读中"
          : "请稍候"
      : hasCompletedAnnotation
        ? "沿这句继续"
        : "用这一句回应我";
  const actionHint = hasCompletedAnnotation
    ? "回到刚才读到的位置"
    : "进入注语正文";
  const fitLine = buildFitLine(result);
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
  const densityClass = index === 0
    ? "px-5 py-8 md:px-10 md:py-11"
    : "px-5 py-9 md:px-10 md:py-12";
  const frameClass = isSelected
    ? "border-y border-zen/60 bg-stone-950/70 shadow-[inset_0_1px_0_rgba(199,179,139,0.18)]"
    : "border-y border-stone-800/45 bg-stone-950/42";

  return (
    <article
      aria-label={`${result.source}${result.chapter}第${result.section}节，${resonanceLabel}`}
      className={`mx-auto w-full max-w-3xl text-center transition-[background-color,border-color,transform] duration-500 motion-safe:animate-ritual-reveal ${densityClass} ${frameClass}`}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="mb-7 md:mb-8">
        <span
          id={chapterLabelId}
          className="border-b border-zen/25 pb-1 text-xs tracking-[0.24em] text-zen/90 font-classic"
        >
          {result.source} · {result.chapter} · 第 {result.section} 节
        </span>
      </div>

      <div className="relative mb-7 min-h-[5.5rem] px-3 md:mb-8 md:min-h-[6.5rem]">
        <span className="absolute -left-1 -top-2 text-4xl text-stone-800/35 font-classic md:text-5xl">“</span>
        <blockquote className="px-4 text-2xl leading-[1.75] text-paper font-classic md:px-10 md:text-3xl md:leading-[1.72]">
          {result.text}
        </blockquote>
        <span className="absolute -right-1 -bottom-3 text-4xl text-stone-800/35 font-classic md:text-5xl">”</span>
      </div>

      <div className="mx-auto max-w-xl">
        <p className="text-base leading-7 text-stone-300 italic font-classic md:text-lg">
          {resonanceLabel}
        </p>
        <p className="mt-2 hidden text-sm leading-7 tracking-[0.08em] text-stone-300/90 md:block">{matchLine}</p>
        <p className="mx-auto mt-4 max-w-md border-y border-stone-800/55 px-4 py-2 text-sm leading-7 text-stone-200/90">
          {fitLine}
        </p>
      </div>

      <div className="mt-7 flex justify-center md:mt-8">
        <div className="flex flex-col items-center gap-2">
          <button
            id={`annotation-action-${result.id}`}
            type="button"
            onClick={() => onAnnotate(result.id, result.text)}
            aria-describedby={chapterLabelId}
            disabled={isAnnotating}
            className={`inline-flex min-w-44 items-center justify-center rounded-full border px-6 py-3 text-sm tracking-[0.22em] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600 disabled:active:scale-100 ${
              hasCompletedAnnotation
                ? "border-zen/80 text-zen hover:border-paper hover:text-paper"
                : "border-stone-700 text-stone-200 hover:border-zen hover:text-paper"
            }`}
          >
            {actionLabel}
          </button>
          <span className="text-xs tracking-[0.1em] text-stone-400">{actionHint}</span>
        </div>
      </div>

      <div className="mt-8 flex justify-center md:mt-9">
        <div className="h-10 w-px bg-gradient-to-b from-stone-700 to-transparent opacity-50" />
      </div>

      {isSelected && (
        <div className="mt-3 text-xs tracking-[0.18em] text-zen/80">
          {isPendingAnnotationTarget
            ? "取义中，此句暂不可重复进入"
            : hasCompletedAnnotation
              ? "此卷仍在，可沿当前注语继续"
              : "当前结果已选中"}
        </div>
      )}
    </article>
  );
}
