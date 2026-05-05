'use client';

import React from 'react';

interface LoadingSkeletonProps {
  type: 'search' | 'annotation' | 'general';
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  type,
  className = ""
}) => {
  const baseClass = "animate-pulse bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 bg-[length:200%_100%]";

  const renderSearchSkeleton = () => (
    <div className={`space-y-4 ${className}`}>
      <div className="text-sm text-stone-400 mb-4">正在比照经典回应...</div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-y border-stone-800 bg-stone-950/55 p-4">
          <div className="flex items-start space-x-3">
            <div className={`${baseClass} w-4 h-4 mt-1`}></div>
            <div className="flex-1 space-y-2">
              <div className={`${baseClass} h-4 w-3/4`}></div>
              <div className={`${baseClass} h-3 w-1/2`}></div>
              <div className={`${baseClass} h-3 w-1/4`}></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderAnnotationSkeleton = () => (
    <div className={`border-y border-stone-800 bg-stone-950/55 p-6 ${className}`}>
      <div className="text-sm text-stone-400 mb-4">注语将成</div>

      <div className="flex space-x-4 mb-6 border-b border-stone-800">
        <div className={`${baseClass} h-8 w-24 mb-[-1px]`}></div>
        <div className={`${baseClass} h-8 w-24 mb-[-1px]`}></div>
      </div>

      <div className="space-y-4">
        <div>
          <div className={`${baseClass} h-5 w-1/3 mb-3`}></div>
          <div className="space-y-2">
            <div className={`${baseClass} h-4 w-full`}></div>
            <div className={`${baseClass} h-4 w-full`}></div>
            <div className={`${baseClass} h-4 w-4/5`}></div>
          </div>
        </div>

        <div>
          <div className={`${baseClass} h-5 w-1/3 mb-3`}></div>
          <div className="space-y-2">
            <div className={`${baseClass} h-4 w-full`}></div>
            <div className={`${baseClass} h-4 w-full`}></div>
            <div className={`${baseClass} h-4 w-3/4`}></div>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-800">
          <div className={`${baseClass} h-4 w-1/4 mb-2`}></div>
          <div className="flex flex-wrap gap-2">
            <div className={`${baseClass} h-6 w-16`}></div>
            <div className={`${baseClass} h-6 w-20`}></div>
            <div className={`${baseClass} h-6 w-18`}></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneralSkeleton = () => (
    <div className={`space-y-3 ${className}`}>
      <div className={`${baseClass} h-4 w-full`}></div>
      <div className={`${baseClass} h-4 w-full`}></div>
      <div className={`${baseClass} h-4 w-3/4`}></div>
    </div>
  );

  switch (type) {
    case 'search':
      return renderSearchSkeleton();
    case 'annotation':
      return renderAnnotationSkeleton();
    case 'general':
    default:
      return renderGeneralSkeleton();
  }
};
