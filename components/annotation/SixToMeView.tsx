import { useEffect, useState } from 'react';

interface SixToMeViewProps {
  text: string;
  reason: string;
  isLoading: boolean;
}

export function SixToMeView({ text, reason, isLoading }: SixToMeViewProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  // Typing animation effect
  useEffect(() => {
    if (!text || isLoading) {
      setDisplayedText('');
      return;
    }

    setIsAnimating(true);
    setDisplayedText('');

    let currentIndex = 0;
    const typingSpeed = 30; // ms per character

    const typeInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsAnimating(false);
        clearInterval(typeInterval);
      }
    }, typingSpeed);

    return () => clearInterval(typeInterval);
  }, [text, isLoading]);

  return (
    <div className="six-to-me-view">
      {/* Header */}
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
          <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 font-classic">六经注我</h3>
          <p className="text-sm text-gray-600">经典如何照见您的思考</p>
        </div>
      </div>

      {/* Content */}
      <div className="bg-gradient-to-r from-primary-50 to-amber-50 border border-primary-200 rounded-lg p-6">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
          </div>
        ) : (
          <div className="relative">
            {/* Text Content */}
            <div className="text-gray-900 leading-relaxed font-classic text-lg whitespace-pre-wrap">
              {displayedText}
              {isAnimating && (
                <span className="inline-block w-1 h-5 bg-primary-600 ml-1 animate-pulse"></span>
              )}
            </div>

            {/* Reason Badge */}
            {reason && displayedText === text && (
              <div className="absolute -top-2 -right-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                  {reason === 'semantic' && '语义相关'}
                  {reason === 'contrast' && '对比对照'}
                  {reason === 'symbolic' && '象征映射'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interpretation Guide */}
      {displayedText === text && !isLoading && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">解读提示</p>
              <p>这段注释展现了经典智慧如何映照您的现代思考，提供了跨越时空的对话视角。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}