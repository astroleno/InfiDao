import { useEffect, useState } from 'react';

interface MeToSixViewProps {
  text: string;
  reason?: string;
  isLoading: boolean;
}

export function MeToSixView({ text, reason, isLoading }: MeToSixViewProps) {
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
    <div className="me-to-six-view">
      {/* Header */}
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center mr-3">
          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 font-classic">我注六经</h3>
          <p className="text-sm text-gray-600">您的思考如何回应经典</p>
        </div>
      </div>

      {/* Content */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-6">
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
                <span className="inline-block w-1 h-5 bg-amber-600 ml-1 animate-pulse"></span>
              )}
            </div>

            {/* Reason Badge */}
            {reason && displayedText === text && (
              <div className="absolute -top-2 -right-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
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
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div className="text-sm text-orange-800">
              <p className="font-medium mb-1">反思提示</p>
              <p>这段注释将您的现代视角注入传统智慧，展现了古今思想的创造性对话。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
