import { useEffect, useState, useRef } from 'react';
import { useAnnotationStore } from '@/lib/stores/annotationStore';

interface StreamingTextProps {
  query: string;
  isLoading: boolean;
  activeTab: 'six_to_me' | 'me_to_six';
  onTabChange: (tab: 'six_to_me' | 'me_to_six') => void;
}

export function StreamingText({
  query,
  isLoading,
  activeTab,
  onTabChange
}: StreamingTextProps) {
  const [displayedSixToMe, setDisplayedSixToMe] = useState('');
  const [displayedMeToSix, setDisplayedMeToSix] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentSection, setCurrentSection] = useState<'six_to_me' | 'me_to_six'>('six_to_me');

  const { streamingText, streamingComplete } = useAnnotationStore();
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Handle streaming text animation
  useEffect(() => {
    if (!isLoading && !streamingText.six_to_me && !streamingText.me_to_six) {
      setDisplayedSixToMe('');
      setDisplayedMeToSix('');
      setIsTyping(false);
      return;
    }

    // Auto-switch to the section that's being updated
    if (streamingText.six_to_me && !displayedSixToMe && currentSection === 'six_to_me') {
      setCurrentSection('six_to_me');
      if (activeTab !== 'six_to_me') {
        onTabChange('six_to_me');
      }
    } else if (streamingText.me_to_six && !displayedMeToSix && currentSection === 'me_to_six') {
      setCurrentSection('me_to_six');
      if (activeTab !== 'me_to_six') {
        onTabChange('me_to_six');
      }
    }
  }, [streamingText, isLoading, activeTab, onTabChange, currentSection, displayedSixToMe, displayedMeToSix]);

  // Typing animation for six_to_me
  useEffect(() => {
    if (streamingText.six_to_me !== displayedSixToMe) {
      setIsTyping(true);
      animateText(streamingText.six_to_me, setDisplayedSixToMe, () => {
        setIsTyping(false);
        // Move to me_to_six after six_to_me completes
        if (streamingText.me_to_six && !displayedMeToSix) {
          setCurrentSection('me_to_six');
          onTabChange('me_to_six');
        }
      });
    }
  }, [streamingText.six_to_me, displayedSixToMe, streamingText.me_to_six, displayedMeToSix, onTabChange]);

  // Typing animation for me_to_six
  useEffect(() => {
    if (streamingText.me_to_six !== displayedMeToSix && displayedSixToMe === streamingText.six_to_me) {
      setIsTyping(true);
      animateText(streamingText.me_to_six, setDisplayedMeToSix, () => {
        setIsTyping(false);
      });
    }
  }, [streamingText.me_to_six, displayedMeToSix, displayedSixToMe, streamingText.six_to_me]);

  // Text animation utility
  function animateText(targetText: string, setter: (text: string) => void, onComplete: () => void) {
    let currentIndex = 0;
    const typingSpeed = 25; // ms per character

    const typeInterval = setInterval(() => {
      if (currentIndex < targetText.length) {
        setter(targetText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        onComplete();
      }
    }, typingSpeed);

    return () => clearInterval(typeInterval);
  }

  // Auto-scroll to bottom when new text appears
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = textContainerRef.current.scrollHeight;
    }
  }, [displayedSixToMe, displayedMeToSix]);

  const getCurrentText = () => {
    return activeTab === 'six_to_me' ? displayedSixToMe : displayedMeToSix;
  };

  const getTargetText = () => {
    return activeTab === 'six_to_me' ? streamingText.six_to_me : streamingText.me_to_six;
  };

  const isCurrentTabTyping = () => {
    return isTyping && (
      (activeTab === 'six_to_me' && displayedSixToMe !== streamingText.six_to_me) ||
      (activeTab === 'me_to_six' && displayedMeToSix !== streamingText.me_to_six)
    );
  };

  return (
    <div className="streaming-text-container">
      {/* Content Display */}
      <div
        ref={textContainerRef}
        className="bg-white border border-gray-200 rounded-lg p-6 min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar"
      >
        <div className="space-y-6">
          {/* Six to Me Section */}
          <div className={`transition-opacity duration-300 ${
            activeTab === 'six_to_me' ? 'opacity-100' : 'opacity-50'
          }`}>
            <div className="flex items-center mb-3">
              <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-2">
                <svg className="w-3 h-3 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-gray-700">六经注我</h4>
              {currentSection === 'six_to_me' && isTyping && (
                <span className="ml-2 text-xs text-primary-600 animate-pulse">正在生成...</span>
              )}
            </div>

            <div className="text-gray-900 leading-relaxed font-classic whitespace-pre-wrap">
              {activeTab === 'six_to_me' ? (
                <>
                  {getCurrentText()}
                  {isCurrentTabTyping() && (
                    <span className="inline-block w-0.5 h-5 bg-primary-600 ml-1 animate-pulse"></span>
                  )}
                </>
              ) : (
                displayedSixToMe || <span className="text-gray-400">等待生成...</span>
              )}
            </div>
          </div>

          {/* Me to Six Section */}
          <div className={`transition-opacity duration-300 ${
            activeTab === 'me_to_six' ? 'opacity-100' : 'opacity-50'
          }`}>
            <div className="flex items-center mb-3">
              <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center mr-2">
                <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-gray-700">我注六经</h4>
              {currentSection === 'me_to_six' && isTyping && (
                <span className="ml-2 text-xs text-amber-600 animate-pulse">正在生成...</span>
              )}
            </div>

            <div className="text-gray-900 leading-relaxed font-classic whitespace-pre-wrap">
              {activeTab === 'me_to_six' ? (
                <>
                  {getCurrentText()}
                  {isCurrentTabTyping() && (
                    <span className="inline-block w-0.5 h-5 bg-amber-600 ml-1 animate-pulse"></span>
                  )}
                </>
              ) : (
                displayedMeToSix || <span className="text-gray-400">等待生成...</span>
              )}
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && (!displayedSixToMe && !displayedMeToSix) && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
            <p className="text-gray-500 text-sm">正在连接经典智慧...</p>
          </div>
        )}

        {/* Completion Indicator */}
        {streamingComplete && displayedSixToMe && displayedMeToSix && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-center text-green-600 text-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              注释完成
            </div>
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      {!streamingComplete && (displayedSixToMe || displayedMeToSix) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>生成进度</span>
            <span>
              {displayedSixToMe ? '✓ 六经注我' : '○ 六经注我'} •
              {displayedMeToSix ? '✓ 我注六经' : '○ 我注六经'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-primary-600 h-1 rounded-full transition-all duration-300"
              style={{
                width: `${((displayedSixToMe ? 50 : 0) + (displayedMeToSix ? 50 : 0))}%`
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}