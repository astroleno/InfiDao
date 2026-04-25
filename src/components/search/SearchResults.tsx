import { SearchResult } from '@/types';
import { ResultCard } from './ResultCard';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onAnnotate: (passageId: string, passageText: string) => void;
  isAnnotating: boolean;
  selectedPassage: string | null;
}

export function SearchResults({
  results,
  query,
  onAnnotate,
  isAnnotating,
  selectedPassage
}: SearchResultsProps) {
  return (
    <div className="mx-auto mt-12 flex max-w-5xl flex-col gap-8 md:gap-10">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-stone-500">经典回应</p>
        <h2 className="mt-3 text-2xl text-paper font-classic md:text-3xl">关于 “{query}” 的 {results.length} 则回响</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-400 md:text-base">
          以下按灵犀高低排列。先选一句进入“六经注我”，Phase 3 再把注释层完整接上。
        </p>
      </div>

      <div className="space-y-6 md:space-y-10">
        {results.map((result, index) => (
          <ResultCard
            key={result.id}
            result={result}
            query={query}
            index={index}
            onAnnotate={onAnnotate}
            isAnnotating={isAnnotating}
            isSelected={selectedPassage === result.id}
          />
        ))}
      </div>
    </div>
  );
}
