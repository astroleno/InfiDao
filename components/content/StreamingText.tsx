'use client';

import React, { useState, useEffect, useRef } from 'react';

interface StreamingTextProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
  text,
  speed = 30,
  className = "",
  onComplete
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  const textRef = useRef(text);

  // Update textRef when text changes
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Start streaming when text changes
  useEffect(() => {
    if (text && text !== displayedText) {
      setIsStreaming(true);
      setCurrentIndex(0);
      setDisplayedText('');

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        setCurrentIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;

          if (nextIndex <= textRef.current.length) {
            setDisplayedText(textRef.current.slice(0, nextIndex));

            if (nextIndex >= textRef.current.length) {
              setIsStreaming(false);
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
              }
              onComplete?.();
            }
          }

          return nextIndex;
        });
      }, speed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, speed, onComplete]);

  return (
    <div className={className}>
      <span className="relative">
        {displayedText}
        {isStreaming && (
          <span className="blinking-cursor inline-block w-0.5 h-4 bg-primary-600 ml-0.5 align-middle animate-pulse"></span>
        )}
      </span>
    </div>
  );
};