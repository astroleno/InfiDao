"use client";
import React, { Component, ErrorInfo, ReactNode } from 'react';

type WindowWithGtag = Window & {
  gtag?: (...args: unknown[]) => void;
};

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);

    // Report error to monitoring service
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      // Default error reporting
      this.reportError(error, errorInfo);
    }
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In production, send to error reporting service
    const gtag = typeof window !== 'undefined' ? (window as WindowWithGtag).gtag : undefined;

    if (gtag) {
      gtag('event', 'exception', {
        description: error.toString(),
        fatal: false
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('Error Boundary');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Component Stack:', errorInfo.componentStack);
      console.groupEnd();
    }
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-background px-4 py-12 text-paper sm:px-6 lg:px-8"
        >
          <div className="w-full max-w-md border-y border-stone-800 bg-stone-950/72 px-6 py-8">
            <div className="text-center">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center border border-seal/70 text-seal">
                  <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <h2 className="mt-6 text-3xl font-semibold text-paper font-classic">
                回响中断
              </h2>

              <p className="mt-3 text-sm leading-7 text-stone-400">
                此刻未能继续成卷。可以重试这一念，或刷新后重新进入。
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-stone-300">
                    错误详情 (仅开发环境)
                  </summary>
                  <div className="mt-2 border border-stone-800 bg-stone-900/70 p-4">
                    <pre className="overflow-auto text-xs text-red-200">
                      {this.state.error.stack}
                    </pre>
                  </div>
                </details>
              )}
            </div>

            <div className="mt-8 space-y-3">
              <button
                onClick={this.handleRetry}
                className="flex w-full justify-center border border-zen/70 px-4 py-2 text-sm font-medium text-zen transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-background"
              >
                重试
              </button>

              <button
                onClick={this.handleReload}
                className="flex w-full justify-center border border-stone-800 px-4 py-2 text-sm font-medium text-stone-300 transition hover:border-stone-600 hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-background"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
