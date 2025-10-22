import { useState, useEffect } from 'react';
import { Annotation } from '@/types';
import { StreamingText } from './StreamingText';
import { SixToMeView } from './SixToMeView';
import { MeToSixView } from './MeToSixView';
import { AnnotationLinks } from './AnnotationLinks';
import { AnnotationMeta } from './AnnotationMeta';
import { LoadingSkeleton } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';

interface AnnotationPanelProps {
  query: string;
  annotation: Annotation | null;
  isLoading: boolean;
  error: Error | null;
  onWikiNavigate: (passageId: string) => void;
}

export function AnnotationPanel({
  query,
  annotation,
  isLoading,
  error,
  onWikiNavigate
}: AnnotationPanelProps) {
  const [activeTab, setActiveTab] = useState<'six_to_me' | 'me_to_six'>('six_to_me');

  // Auto-switch tabs based on content availability
  useEffect(() => {
    if (annotation?.six_to_me && !annotation?.me_to_six) {
      setActiveTab('six_to_me');
    } else if (annotation?.me_to_six && !annotation?.six_to_me) {
      setActiveTab('me_to_six');
    }
  }, [annotation]);

  if (error) {
    return (
      <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">注释生成失败</h3>
          <p className="text-gray-600 text-sm">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !annotation) {
    return (
      <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 font-classic">六经注我</h2>
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-pulse mr-2">正在生成注释...</div>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
            </div>
          </div>

          {/* Streaming Content Area */}
          <div className="space-y-6">
            {/* User Query Display */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-sm text-amber-600 font-medium mb-2">您的思考</div>
              <div className="text-gray-900 font-classic">{query}</div>
            </div>

            {/* Loading Streaming Text */}
            <StreamingText
              query={query}
              isLoading={true}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 font-classic">六经注我</h2>
          <div className="flex items-center space-x-2">
            <AnnotationMeta annotation={annotation} />
          </div>
        </div>
      </div>

      {/* User Query Display */}
      <div className="p-6 pb-0">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-600 font-medium mb-2">您的思考</div>
          <div className="text-gray-900 font-classic">{query}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 pt-6">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('six_to_me')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'six_to_me'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            六经注我
          </button>
          <button
            onClick={() => setActiveTab('me_to_six')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'me_to_six'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            我注六经
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6">
        <div className="space-y-6">
          {/* Six to Me View */}
          {activeTab === 'six_to_me' && (
            <SixToMeView
              text={annotation.six_to_me}
              reason={annotation.reason}
              isLoading={isLoading}
            />
          )}

          {/* Me to Six View */}
          {activeTab === 'me_to_six' && (
            <MeToSixView
              text={annotation.me_to_six}
              reason={annotation.reason}
              isLoading={isLoading}
            />
          )}

          {/* Annotation Links */}
          {annotation.links && annotation.links.length > 0 && (
            <AnnotationLinks
              links={annotation.links}
              onNavigate={onWikiNavigate}
            />
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            匹配度: {Math.round(annotation.score * 100)}%
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              收藏
            </Button>
            <Button variant="outline" size="sm">
              分享
            </Button>
            <Button size="sm" onClick={() => onWikiNavigate(annotation.passage_id)}>
              深入探索
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}