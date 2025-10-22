import { useState } from 'react';
import { SearchResult } from '@/types';
import { Button } from '@/components/ui/Button';

interface ResultCardProps {
  result: SearchResult;
  query: string;
  index: number;
  onAnnotate: (passageId: string, passageText: string) => void;
  onWikiNavigate: (passageId: string) => void;
  isAnnotating: boolean;
  isSelected: boolean;
}

export function ResultCard({
  result,
  query,
  index,
  onAnnotate,
  onWikiNavigate,
  isAnnotating,
  isSelected
}: ResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.8) return 'text-blue-600 bg-blue-100';
    if (score >= 0.7) return 'text-amber-600 bg-amber-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getSourceIcon = (source: string) => {
    const iconMap: { [key: string]: string } = {
      '论语': '📖',
      '孟子': '📘',
      '大学': '📗',
      '中庸': '📕',
      '诗经': '📓',
      '尚书': '📙',
      '礼记': '📔',
      '易经': '📒',
      '春秋': '📓'
    };
    return iconMap[source] || '📚';
  };

  return (
    <div
      className={`result-card bg-white border rounded-xl overflow-hidden transition-all duration-200 ${
        isSelected
          ? 'border-primary-500 shadow-lg ring-2 ring-primary-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <span className="text-2xl mr-3">{getSourceIcon(result.source)}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 font-classic">
                {highlightText(result.source, query)}
              </h3>
              <p className="text-sm text-gray-600">
                {result.chapter} · 第 {result.section} 节
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(result.score)}`}>
              {Math.round(result.score * 100)}% 匹配
            </span>
            <div className="text-xs text-gray-500">
              #{index + 1}
            </div>
          </div>
        </div>

        {/* Main Text */}
        <div className="mb-4">
          <div className="text-gray-900 leading-relaxed font-classic text-lg">
            {highlightText(result.text, query)}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mb-4 pt-4 border-t border-gray-200">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">详细信息</h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">经典ID:</dt>
                  <dd className="text-gray-900">{result.id}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">匹配度:</dt>
                  <dd className="text-gray-900">{(result.score * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-gray-500">字数:</dt>
                  <dd className="text-gray-900">{result.text.length}字</dd>
                </div>
                <div>
                  <dt className="text-gray-500">收录时间:</dt>
                  <dd className="text-gray-900">
                    {result.metadata?.created_at
                      ? new Date(result.metadata.created_at).toLocaleDateString()
                      : '未知'
                    }
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              onClick={() => onAnnotate(result.id, result.text)}
              disabled={isAnnotating && isSelected}
              className="relative"
            >
              {isAnnotating && isSelected ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  生成中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  生成注释
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onWikiNavigate(result.id)}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              探索
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 3.12-9.032 7.326m0 0A9.001 9.001 0 0012 21c4.474 0 8.268-3.12 9.032-7.326" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="bg-primary-50 px-6 py-3 border-t border-primary-200">
          <div className="flex items-center text-primary-700 text-sm">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            正在为此段落生成注释...
          </div>
        </div>
      )}
    </div>
  );
}