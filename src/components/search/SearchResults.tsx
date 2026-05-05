import { SearchResult } from '@/types';
import { ResultCard } from './ResultCard';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onAnnotate: (passageId: string, passageText: string) => void;
  isAnnotating: boolean;
  pendingAnnotationPassageId: string | null;
  selectedPassage: string | null;
  activeAnnotationPassage: string | null;
}

export function SearchResults({
  results,
  query,
  onAnnotate,
  isAnnotating,
  pendingAnnotationPassageId,
  selectedPassage,
  activeAnnotationPassage,
}: SearchResultsProps) {
  return (
    <div className="flex w-full flex-col gap-6 md:gap-10">
      <div className="hidden text-center md:block">
        <p className="text-xs uppercase tracking-[0.35em] text-stone-500">经典回应</p>
        <h2 className="mt-3 text-2xl text-paper font-classic md:text-3xl">关于 “{query}” 的 {results.length} 则回响</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-400 md:text-base">
          以下按灵犀高低排列。选择一句进入“六经注我”，再沿延伸入口继续探索。
        </p>
      </div>

      <div className="space-y-6 md:space-y-10">
        {results.map((result, index) => {
          const isSelected = selectedPassage === result.id;

          return (
            <div key={result.id} className="space-y-6 md:space-y-10">
              <ResultCard
                result={result}
                index={index}
                onAnnotate={onAnnotate}
                isAnnotating={isAnnotating}
                pendingAnnotationPassageId={pendingAnnotationPassageId}
                isSelected={isSelected}
                hasCompletedAnnotation={activeAnnotationPassage === result.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
