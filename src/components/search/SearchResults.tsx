import { SearchResult } from '@/types';
import { ResultCard } from './ResultCard';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onAnnotate: (passageId: string, passageText: string) => void;
  isAnnotating: boolean;
  pendingAnnotationPassageId: string | null;
  selectedPassage: string | null;
  activeReadingRootPassage: string | null;
  mode?: "direct" | "bridge" | "fallback";
  bridgeSummary?: string | null;
}

function buildResultPathLine({
  mode,
  bridgeSummary,
}: {
  mode: "direct" | "bridge" | "fallback";
  bridgeSummary?: string | null | undefined;
}) {
  if (mode === "bridge") {
    return `这一问先落到「${bridgeSummary ?? "经典概念"}」之间，先从最贴近的一句开始。`;
  }

  if (mode === "fallback") {
    return "原句暂未贴住，经文先从旁处接近这一念。";
  }

  return "先看最贴近的一句，再让注语带你往下一层走。";
}

export function SearchResults({
  results,
  query,
  onAnnotate,
  isAnnotating,
  pendingAnnotationPassageId,
  selectedPassage,
  activeReadingRootPassage,
  mode = "direct",
  bridgeSummary,
}: SearchResultsProps) {
  const isFallback = mode === "fallback";
  const isBridge = mode === "bridge";
  const pathLine = buildResultPathLine({ mode, bridgeSummary });

  return (
    <div className="flex w-full flex-col gap-5 md:gap-8">
      <div className="hidden text-center md:block">
        <p className="text-xs uppercase tracking-[0.35em] text-stone-300">
          {isBridge ? "经典词路" : isFallback ? "旁通入口" : "经典回应"}
        </p>
        <h2 className="mt-3 text-2xl text-paper font-classic md:text-3xl">关于 “{query}” 的 {results.length} 则回响</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-stone-200/85 md:text-base">
          {isBridge
            ? `我先把这一念译成「${bridgeSummary ?? "经典概念"}」来取回应，你可以直接择一句入卷。`
            : isFallback
            ? "原路暂未听见清晰回应，先给你几句旁通入口，可以择一句试读。"
            : "以下按灵犀高低排列。选择一句让经典回应你，再沿下一句继续探索。"}
        </p>
        <p className="mx-auto mt-3 max-w-xl border-y border-stone-800/55 px-4 py-2 text-sm leading-7 text-zen/90 font-classic">
          {pathLine}
        </p>
      </div>

      <div className="space-y-5 md:space-y-8">
        {results.map((result, index) => {
          const isSelected = selectedPassage === result.id;

          return (
            <div key={result.id} className="space-y-5 md:space-y-8">
              <ResultCard
                result={result}
                index={index}
                onAnnotate={onAnnotate}
                isAnnotating={isAnnotating}
                pendingAnnotationPassageId={pendingAnnotationPassageId}
                isSelected={isSelected}
                hasCompletedAnnotation={activeReadingRootPassage === result.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
