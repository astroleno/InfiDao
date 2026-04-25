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
      console.group('🚨 Error Boundary');
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                出现了一些问题
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                很抱歉，应用程序遇到了意外错误。
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700">
                    错误详情 (仅开发环境)
                  </summary>
                  <div className="mt-2 p-4 bg-gray-100 rounded-lg">
                    <pre className="text-xs text-red-600 overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  </div>
                </details>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                重试
              </button>

              <button
                onClick={this.handleReload}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                刷新页面
              </button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                如果问题持续存在，请联系我们的技术支持。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
