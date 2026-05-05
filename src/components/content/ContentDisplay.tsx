'use client';

import React from 'react';
import { StreamingText } from './StreamingText';

interface ContentDisplayProps {
  content: string;
  isLoading: boolean;
  onWordClick: (word: string) => void;
  className?: string;
}

const InteractiveContent: React.FC<{
  content: string;
  onWordClick: (word: string) => void;
  className?: string;
}> = ({ content, onWordClick, className = "" }) => {
  // Split content into words while preserving whitespace and punctuation
  const words = content.split(/(\s+|[\u4e00-\u9fff]+|[a-zA-Z]+|[.,!?;:()"'\[\]])/).filter(Boolean);

  return (
    <p className={`text-paper leading-relaxed text-base ${className}`}>
      {words.map((word, index) => {
        // Only make meaningful words clickable (non-whitespace, non-punctuation)
        if (/\S/.test(word) && !/^[.,!?;:()"'\[\]]+$/.test(word)) {
          const cleanWord = word.replace(/^[.,!?;:()"'\[\]]+|[.,!?;:()"'\[\]]+$/g, '');

          if (cleanWord.length > 1) { // Only click if word has meaningful length
            return (
              <button
                key={index}
                onClick={() => onWordClick(cleanWord)}
                className="interactive-word inline mx-0.5 border-b border-transparent px-0.5 py-0 text-zen transition-colors duration-150 hover:border-zen hover:text-paper focus:outline-none focus:ring-1 focus:ring-zen"
                aria-label={`Learn more about "${cleanWord}"`}
                title={`点击探索 "${cleanWord}" 的相关内容`}
              >
                {word}
              </button>
            );
          }
        }
        // Render whitespace and punctuation as-is
        return <span key={index}>{word}</span>;
      })}
    </p>
  );
};

const LoadingContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="relative">
    <p className="text-paper leading-relaxed text-base">
      {content}
      <span className="blinking-cursor inline-block w-0.5 h-4 bg-zen ml-0.5 align-middle motion-safe:animate-pulse"></span>
    </p>
  </div>
);

export const ContentDisplay: React.FC<ContentDisplayProps> = ({
  content,
  isLoading,
  onWordClick,
  className = ""
}) => {
  if (isLoading) {
    return <LoadingContent content={content} />;
  }

  if (content) {
    return <InteractiveContent content={content} onWordClick={onWordClick} className={className} />;
  }

  return null;
};
