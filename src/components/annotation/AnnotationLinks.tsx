import { useState } from 'react';

interface AnnotationLink {
  to_passage: string;
  score: number;
  reason?: string;
}

interface AnnotationLinksProps {
  links: AnnotationLink[];
  onNavigate: (passageId: string) => void;
}

export function AnnotationLinks({ links, onNavigate }: AnnotationLinksProps) {
  const [expandedLink, setExpandedLink] = useState<string | null>(null);

  if (!links || links.length === 0) {
    return null;
  }

  const getReasonIcon = (reason?: string) => {
    switch (reason) {
      case 'semantic':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'contrast':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        );
      case 'symbolic':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        );
    }
  };

  const getReasonLabel = (reason?: string) => {
    switch (reason) {
      case 'semantic': return '语义相关';
      case 'contrast': return '对比对照';
      case 'symbolic': return '象征映射';
      default: return '相关链接';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.6) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className="annotation-links">
      <div className="flex items-center mb-4">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 font-classic">延伸探索</h3>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => (
          <div
            key={`${link.to_passage}-${index}`}
            className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md"
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-2">
                      {getReasonIcon(link.reason)}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {getReasonLabel(link.reason)}
                    </span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium border ${getScoreColor(link.score)}`}>
                      {Math.round(link.score * 100)}% 匹配
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 mb-3">
                    段落 ID: {link.to_passage}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onNavigate(link.to_passage)}
                      className="inline-flex items-center text-primary-600 hover:text-primary-800 text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      探索此段落
                    </button>

                    <button
                      onClick={() => setExpandedLink(expandedLink === link.to_passage ? null : link.to_passage)}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transform transition-transform ${
                          expandedLink === link.to_passage ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedLink === link.to_passage && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="bg-white rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <div className="animate-pulse flex space-x-2">
                        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      点击"探索此段落"查看相关内容并生成新的注释
                    </div>
                    <div className="mt-3 flex space-x-2">
                      <button className="text-xs bg-primary-100 text-primary-700 px-3 py-1 rounded-full hover:bg-primary-200 transition-colors">
                        查看原文
                      </button>
                      <button className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full hover:bg-amber-200 transition-colors">
                        生成注释
                      </button>
                      <button className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors">
                        添加到探索路径
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Infinite Wiki Prompt */}
      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 mb-1">无限知识图谱</h4>
            <p className="text-xs text-blue-700">
              每个链接都是通向更深智慧的入口，构建属于您的知识网络
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}