import { useEffect, useState } from 'react';

interface SixToMeViewProps {
  text: string;
  reason?: string;
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
      <div className="mb-4 flex items-center">
        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-zen/10 text-zen">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-paper font-classic">六经注我</h3>
          <p className="text-sm text-stone-400">经典如何照见您的思考</p>
        </div>
      </div>

      <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-6">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-4 animate-pulse rounded bg-stone-800"></div>
            <div className="h-4 w-3/4 animate-pulse rounded bg-stone-800"></div>
            <div className="h-4 w-1/2 animate-pulse rounded bg-stone-800"></div>
          </div>
        ) : (
          <div className="relative">
            <div className="whitespace-pre-wrap text-lg leading-relaxed text-paper font-classic">
              {displayedText}
              {isAnimating && (
                <span className="ml-1 inline-block h-5 w-1 animate-pulse bg-zen"></span>
              )}
            </div>

            {reason && displayedText === text && (
              <div className="absolute -top-2 -right-2">
                <span className="inline-flex items-center rounded-full bg-zen/10 px-2.5 py-0.5 text-xs font-medium text-zen">
                  {reason === 'semantic' && '语义相关'}
                  {reason === 'contrast' && '对比对照'}
                  {reason === 'symbolic' && '象征映射'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {displayedText === text && !isLoading && (
        <div className="mt-4 rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <div className="flex items-start">
            <svg className="mr-2 mt-0.5 h-5 w-5 flex-shrink-0 text-zen" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-stone-400">
              <p className="font-medium mb-1">解读提示</p>
              <p>这段注释展现了经典智慧如何映照您的现代思考，提供了跨越时空的对话视角。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
