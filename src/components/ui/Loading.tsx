import React from 'react';
import { clsx } from 'clsx';

interface LoadingSkeletonProps {
  type?: 'search' | 'annotation' | 'card' | 'text' | 'avatar';
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ type = 'text', className, lines = 3 }: LoadingSkeletonProps) {
  const baseClasses = 'animate-pulse bg-stone-800';

  const typeClasses = {
    search: 'h-12 w-full',
    annotation: 'h-32 w-full',
    card: 'h-48 w-full',
    text: 'h-4 w-full',
    avatar: 'h-10 w-10 rounded-full'
  };

  const skeletons = {
    search: (
      <div className={clsx(baseClasses, typeClasses.search, className)} />
    ),
    annotation: (
      <div className={clsx(baseClasses, typeClasses.annotation, className)} />
    ),
    card: (
      <div className={clsx('p-6 border-y border-stone-800 bg-stone-950/45', className)}>
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className={clsx(baseClasses, typeClasses.avatar)} />
            <div className="flex-1 space-y-2">
              <div className={clsx(baseClasses, 'h-4 w-3/4')} />
              <div className={clsx(baseClasses, 'h-3 w-1/2')} />
            </div>
          </div>
          <div className="space-y-2">
            {[...Array(lines)].map((_, i) => (
              <div
                key={i}
                className={clsx(
                  baseClasses,
                  'h-4',
                  i === lines - 1 ? 'w-3/4' : 'w-full'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    text: (
      <div className={clsx('space-y-2', className)}>
        {[...Array(lines)].map((_, i) => (
          <div
            key={i}
            className={clsx(
              baseClasses,
              typeClasses.text,
              i === lines - 1 ? 'w-3/4' : 'w-full'
            )}
          />
        ))}
      </div>
    ),
    avatar: (
      <div className={clsx(baseClasses, typeClasses.avatar, className)} />
    )
  };

  return skeletons[type];
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div className="relative">
        <div
          className={clsx(
            'animate-spin rounded-full border-2 border-stone-800 border-t-zen',
            sizeClasses[size]
          )}
          aria-hidden="true"
        />
        {label && (
          <span className="sr-only">{label}</span>
        )}
      </div>
    </div>
  );
}

interface LoadingProgressProps {
  value: number;
  max?: number;
  className?: string;
  label?: string;
  showPercentage?: boolean;
}

export function LoadingProgress({
  value,
  max = 100,
  className,
  label,
  showPercentage = true
}: LoadingProgressProps) {
  const percentage = Math.round((value / max) * 100);

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-stone-300">{label}</span>
          {showPercentage && (
            <span className="text-sm text-stone-500">{percentage}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-stone-800 h-2">
        <div
          className="bg-zen h-2 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        />
      </div>
    </div>
  );
}
