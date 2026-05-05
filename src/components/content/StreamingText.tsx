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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textRef = useRef(text);

  // Update textRef when text changes
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Start streaming when text changes
  useEffect(() => {
    if (!text) {
      setIsStreaming(false);
      setDisplayedText('');
      return undefined;
    }

    setIsStreaming(true);
    setDisplayedText('');

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    let currentIndex = 0;

    intervalRef.current = setInterval(() => {
      currentIndex += 1;
      setDisplayedText(textRef.current.slice(0, currentIndex));

      if (currentIndex >= textRef.current.length) {
        setIsStreaming(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        onComplete?.();
      }
    }, speed);

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
          <span className="blinking-cursor inline-block w-0.5 h-4 bg-zen ml-0.5 align-middle motion-safe:animate-pulse"></span>
        )}
      </span>
    </div>
  );
};
