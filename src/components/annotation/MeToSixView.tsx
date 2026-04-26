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
      <div className="mb-4 flex items-center">
        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-zen/10 text-zen">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-paper font-classic">我注六经</h3>
          <p className="text-sm text-stone-400">您的思考如何回应经典</p>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div className="text-sm text-stone-400">
              <p className="font-medium mb-1">反思提示</p>
              <p>这段注释将您的现代视角注入传统智慧，展现了古今思想的创造性对话。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
