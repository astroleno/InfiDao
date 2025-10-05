import { useState } from 'react';
import { SearchOptions } from '@/types';

interface SearchFiltersProps {
  filters: SearchOptions['filters'];
  onChange: (filters: SearchOptions['filters']) => void;
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
  const [localFilters, setLocalFilters] = useState(filters);

  const handleBookToggle = (bookId: string) => {
    const currentBooks = localFilters.book || [];
    const newBooks = currentBooks.includes(bookId)
      ? currentBooks.filter(id => id !== bookId)
      : [...currentBooks, bookId];

    const newFilters = {
      ...localFilters,
      book: newBooks.length > 0 ? newBooks : undefined
    };

    setLocalFilters(newFilters);
    onChange(newFilters);
  };

  const handleChapterToggle = (book: string, chapter: string) => {
    const currentChapters = localFilters.chapter || [];
    const chapterKey = `${book}:${chapter}`;
    const newChapters = currentChapters.includes(chapterKey)
      ? currentChapters.filter(c => c !== chapterKey)
      : [...currentChapters, chapterKey];

    const newFilters = {
      ...localFilters,
      chapter: newChapters.length > 0 ? newChapters : undefined
    };

    setLocalFilters(newFilters);
    onChange(newFilters);
  };

  const hasActiveFilters = !!(localFilters.book?.length || localFilters.chapter?.length);

  return (
    <div className="search-filters">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
          </svg>
          搜索筛选
          {hasActiveFilters && (
            <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
              {(localFilters.book?.length || 0) + (localFilters.chapter?.length || 0)}
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
            onClick={onClear}
            className="text-sm text-red-600 hover:text-red-800 transition-colors"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          {/* Book Filters */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">经典书目</h3>
            <div className="grid grid-cols-3 gap-2">
              {CLASSIC_BOOKS.map((book) => {
                const isSelected = localFilters.book?.includes(book.id);
                return (
                  <button
                    key={book.id}
                    onClick={() => handleBookToggle(book.id)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div>{book.name}</div>
                    <div className="text-xs opacity-60">{book.count}条</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chapter Filters */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">热门章节</h3>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_CHAPTERS.map((item, index) => {
                const chapterKey = `${item.book}:${item.chapter}`;
                const isSelected = localFilters.chapter?.includes(chapterKey);
                return (
                  <button
                    key={index}
                    onClick={() => handleChapterToggle(item.book, item.chapter)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-classic">{item.chapter}</div>
                    <div className="text-xs opacity-60">{item.book} · {item.count}条</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Summary */}
          {hasActiveFilters && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  已选择 {hasActiveFilters} 个筛选条件
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      const allBooks = CLASSIC_BOOKS.map(book => book.id);
                      handleBookToggle(allBooks[0]); // This would need to be adapted
                    }}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    全选
                  </button>
                  <button
                    onClick={onClear}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    清除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}