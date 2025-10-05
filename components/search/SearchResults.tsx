import { SearchResult } from '@/types';
import { ResultCard } from './ResultCard';
import { LoadingSkeleton } from '@/components/ui/Loading';

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  onAnnotate: (passageId: string, passageText: string) => void;
  onWikiNavigate: (passageId: string) => void;
  isAnnotating: boolean;
  selectedPassage: string | null;
}

export function SearchResults({
  results,
  query,
  onAnnotate,
  onWikiNavigate,
  isAnnotating,
  selectedPassage
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="search-results-empty">
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">未找到相关经典</h3>
          <p className="text-gray-600 text-sm mb-4">
            尝试用不同的关键词重新搜索，或浏览热门话题
          </p>
          <div className="flex justify-center">
            <button className="text-primary-600 hover:text-primary-800 text-sm font-medium">
              查看搜索建议
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-classic">搜索结果</h2>
          <p className="text-sm text-gray-600 mt-1">
            为 "{query}" 找到 {results.length} 条相关经典
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">排序：</span>
          <select className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-primary-500">
            <option>相关度</option>
            <option>经典顺序</option>
            <option>章节顺序</option>
          </select>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {results.map((result, index) => (
          <ResultCard
            key={result.id}
            result={result}
            query={query}
            index={index}
            onAnnotate={onAnnotate}
            onWikiNavigate={onWikiNavigate}
            isAnnotating={isAnnotating}
            isSelected={selectedPassage === result.id}
          />
        ))}
      </div>

      {/* Load More */}
      <div className="mt-8 text-center">
        <button className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          加载更多结果
        </button>
      </div>

      {/* Search Tips */}
      <div className="mt-12 p-6 bg-blue-50 border border-blue-200 rounded-xl">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">搜索小贴士</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-900">使用具体概念</h4>
              <p className="text-sm text-blue-700">搜索"仁"、"礼"、"中庸"等核心概念</p>
            </div>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-900">探索现代话题</h4>
              <p className="text-sm text-blue-700">用现代语言描述，AI会找到相关经典</p>
            </div>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-900">筛选经典范围</h4>
              <p className="text-sm text-blue-700">使用筛选器专注于特定经典或章节</p>
            </div>
          </div>
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-blue-900">跟随链接探索</h4>
              <p className="text-sm text-blue-700">点击延伸链接构建知识网络</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}