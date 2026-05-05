import { useEffect, useState } from 'react';

interface SearchFilterValue {
  book?: string[];
  chapter?: string[];
}

interface SearchFiltersProps {
  filters?: SearchFilterValue;
  onChange: (filters: SearchFilterValue) => void;
  onClear: () => void;
}

const CLASSIC_BOOKS = [
  { id: '论语', name: '论语', count: 432 },
  { id: '孟子', name: '孟子', count: 287 },
  { id: '大学', name: '大学', count: 154 },
  { id: '中庸', name: '中庸', count: 98 },
  { id: '诗经', name: '诗经', count: 312 },
  { id: '尚书', name: '尚书', count: 201 },
  { id: '礼记', name: '礼记', count: 276 },
  { id: '易经', name: '易经', count: 189 },
  { id: '春秋', name: '春秋', count: 167 }
];

const POPULAR_CHAPTERS = [
  { book: '论语', chapter: '学而', count: 16 },
  { book: '论语', chapter: '为政', count: 24 },
  { book: '论语', chapter: '八佾', count: 26 },
  { book: '大学', chapter: '经一章', count: 11 },
  { book: '中庸', chapter: '第一章', count: 12 },
  { book: '孟子', chapter: '梁惠王上', count: 7 }
];

export function SearchFilters({ filters, onChange, onClear }: SearchFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<SearchFilterValue>(filters ?? {});

  useEffect(() => {
    setLocalFilters(filters ?? {});
  }, [filters]);

  const syncFilters = (nextFilters: SearchFilterValue) => {
    const normalizedFilters: SearchFilterValue = {
      ...(nextFilters.book?.length ? { book: nextFilters.book } : {}),
      ...(nextFilters.chapter?.length ? { chapter: nextFilters.chapter } : {}),
    };

    setLocalFilters(normalizedFilters);
    onChange(normalizedFilters);
  };

  const handleBookToggle = (bookId: string) => {
    const currentBooks = localFilters.book ?? [];
    const newBooks = currentBooks.includes(bookId)
      ? currentBooks.filter(id => id !== bookId)
      : [...currentBooks, bookId];

    syncFilters({
      ...localFilters,
      book: newBooks,
    });
  };

  const handleChapterToggle = (book: string, chapter: string) => {
    const currentChapters = localFilters.chapter ?? [];
    const chapterKey = `${book}:${chapter}`;
    const newChapters = currentChapters.includes(chapterKey)
      ? currentChapters.filter(c => c !== chapterKey)
      : [...currentChapters, chapterKey];

    syncFilters({
      ...localFilters,
      chapter: newChapters,
    });
  };

  const selectedFilterCount = (localFilters.book?.length ?? 0) + (localFilters.chapter?.length ?? 0);
  const hasActiveFilters = selectedFilterCount > 0;

  return (
    <div className="search-filters">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="flex items-center text-sm text-stone-400 transition-colors hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
          </svg>
          搜索筛选
          {hasActiveFilters && (
            <span className="ml-2 border border-zen/40 px-2 py-0.5 text-xs text-zen">
              {selectedFilterCount}
            </span>
          )}
          <svg
            className={`w-4 h-4 ml-1 transform transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-seal transition-colors hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-ink"
          >
            清除筛选
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-6 border-y border-stone-800 bg-stone-950/60 p-6">
          <div>
            <h3 className="text-sm font-medium text-paper mb-3">经典书目</h3>
            <div className="grid grid-cols-3 gap-2">
              {CLASSIC_BOOKS.map((book) => {
                const isSelected = localFilters.book?.includes(book.id);
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => handleBookToggle(book.id)}
                    className={`border px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink ${
                      isSelected
                        ? 'border-zen bg-zen text-ink font-medium'
                        : 'border-stone-800 bg-stone-950/35 text-stone-300 hover:border-stone-600 hover:text-paper'
                    }`}
                  >
                    <div>{book.name}</div>
                    <div className="text-xs opacity-60">{book.count}条</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-paper mb-3">热门章节</h3>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_CHAPTERS.map((item, index) => {
                const chapterKey = `${item.book}:${item.chapter}`;
                const isSelected = localFilters.chapter?.includes(chapterKey);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleChapterToggle(item.book, item.chapter)}
                    className={`border px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink ${
                      isSelected
                        ? 'border-seal bg-seal/20 text-red-100 font-medium'
                        : 'border-stone-800 bg-stone-950/35 text-stone-300 hover:border-stone-600 hover:text-paper'
                    }`}
                  >
                    <div className="font-classic">{item.chapter}</div>
                    <div className="text-xs opacity-60">{item.book} · {item.count}条</div>
                  </button>
                );
              })}
            </div>
          </div>

          {hasActiveFilters && (
            <div className="pt-4 border-t border-stone-800">
              <div className="flex items-center justify-between">
                <div className="text-sm text-stone-400">
                  已选择 {selectedFilterCount} 个筛选条件
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  className="text-sm text-seal hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-ink"
                >
                  清除
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
