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
  const baseClass = "animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%]";

  const renderSearchSkeleton = () => (
    <div className={`space-y-4 ${className}`}>
      <div className="text-sm text-gray-500 mb-4">正在搜索相关经典...</div>
      {/* Skeleton items */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-start space-x-3">
            <div className={`${baseClass} w-4 h-4 rounded-full mt-1`}></div>
            <div className="flex-1 space-y-2">
              <div className={`${baseClass} h-4 rounded w-3/4`}></div>
              <div className={`${baseClass} h-3 rounded w-1/2`}></div>
              <div className={`${baseClass} h-3 rounded w-1/4`}></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderAnnotationSkeleton = () => (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 shadow-sm ${className}`}>
      <div className="text-sm text-gray-500 mb-4">正在生成注释...</div>

      {/* Tab headers */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <div className={`${baseClass} h-8 w-24 rounded-t-lg mb-[-1px]`}></div>
        <div className={`${baseClass} h-8 w-24 rounded-t-lg mb-[-1px]`}></div>
      </div>

      {/* Annotation content skeleton */}
      <div className="space-y-4">
        <div>
          <div className={`${baseClass} h-5 rounded w-1/3 mb-3`}></div>
          <div className="space-y-2">
            <div className={`${baseClass} h-4 rounded w-full`}></div>
            <div className={`${baseClass} h-4 rounded w-full`}></div>
            <div className={`${baseClass} h-4 rounded w-4/5`}></div>
          </div>
        </div>

        <div>
          <div className={`${baseClass} h-5 rounded w-1/3 mb-3`}></div>
          <div className="space-y-2">
            <div className={`${baseClass} h-4 rounded w-full`}></div>
            <div className={`${baseClass} h-4 rounded w-full`}></div>
            <div className={`${baseClass} h-4 rounded w-3/4`}></div>
          </div>
        </div>

        {/* Links skeleton */}
        <div className="pt-4 border-t border-gray-100">
          <div className={`${baseClass} h-4 rounded w-1/4 mb-2`}></div>
          <div className="flex flex-wrap gap-2">
            <div className={`${baseClass} h-6 w-16 rounded-full`}></div>
            <div className={`${baseClass} h-6 w-20 rounded-full`}></div>
            <div className={`${baseClass} h-6 w-18 rounded-full`}></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneralSkeleton = () => (
    <div className={`space-y-3 ${className}`}>
      <div className={`${baseClass} h-4 rounded w-full`}></div>
      <div className={`${baseClass} h-4 rounded w-full`}></div>
      <div className={`${baseClass} h-4 rounded w-3/4`}></div>
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