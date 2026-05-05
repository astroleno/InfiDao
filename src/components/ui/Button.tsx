import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';

    const variants = {
      primary: 'border border-zen bg-zen text-ink hover:bg-paper focus:ring-zen',
      secondary: 'border border-stone-700 bg-stone-900 text-stone-200 hover:border-stone-500 hover:text-paper focus:ring-zen',
      outline: 'border border-stone-700 bg-transparent text-stone-300 hover:border-zen hover:text-paper focus:ring-zen',
      ghost: 'text-stone-300 hover:text-paper focus:ring-zen',
      destructive: 'border border-red-800 bg-red-950/35 text-red-100 hover:border-red-400 focus:ring-red-300'
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    };

    const classes = clsx(
      baseClasses,
      variants[variant],
      sizes[size],
      {
        'w-full': fullWidth,
        'cursor-wait': loading
      },
      className
    );

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
