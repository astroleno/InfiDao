// Performance monitoring utilities

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private observers: PerformanceObserver[] = [];

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Measure execution time
  static measure<T>(
    name: string,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const start = performance.now();

    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        const end = performance.now();
        this.getInstance().recordMetric(name, end - start);
      });
    } else {
      const end = performance.now();
      this.getInstance().recordMetric(name, end - start);
      return result;
    }
  }

  // Record custom metric
  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }

    // Log slow operations
    if (value > 1000) { // > 1 second
      console.warn(`Slow operation detected: ${name} took ${value.toFixed(2)}ms`);
    }
  }

  // Get metric statistics
  getMetricStats(name: string) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      average: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  // Monitor Web Vitals
  observeWebVitals() {
    if (typeof window === 'undefined' || !window.PerformanceObserver) return;

    // Largest Contentful Paint (LCP)
    this.observePerformanceObserver('largest-contentful-paint', (entries) => {
      const lastEntry = entries[entries.length - 1];
      console.log('LCP:', lastEntry.startTime);
      this.recordMetric('lcp', lastEntry.startTime);
    });

    // First Input Delay (FID)
    this.observePerformanceObserver('first-input', (entries) => {
      const entry = entries[0];
      if (entry) {
        console.log('FID:', entry.processingStart - entry.startTime);
        this.recordMetric('fid', entry.processingStart - entry.startTime);
      }
    });

    // Cumulative Layout Shift (CLS)
    this.observePerformanceObserver('layout-shift', (entries) => {
      let clsValue = 0;
      entries.forEach(entry => {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      });
      if (clsValue > 0) {
        console.log('CLS:', clsValue);
        this.recordMetric('cls', clsValue);
      }
    });
  }

  private observePerformanceObserver(type: string, callback: (entries: any[]) => void) {
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries());
      });

      observer.observe({ type, buffered: true });
      this.observers.push(observer);
    } catch (error) {
      console.warn(`PerformanceObserver for ${type} not supported:`, error);
    }
  }

  // Generate performance report
  generateReport() {
    const report: any = {
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'SSR',
      metrics: {}
    };

    this.metrics.forEach((values, name) => {
      report.metrics[name] = this.getMetricStats(name);
    });

    return report;
  }

  // Cleanup observers
  disconnect() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor() {
  const monitor = PerformanceMonitor.getInstance();

  return {
    measure: <T>(name: string, fn: () => T | Promise<T>) => {
      return PerformanceMonitor.measure(name, fn);
    },
    recordMetric: (name: string, value: number) => monitor.recordMetric(name, value),
    getStats: (name: string) => monitor.getMetricStats(name),
    generateReport: () => monitor.generateReport()
  };
}

// Memory usage monitoring
export function checkMemoryUsage() {
  if (typeof window !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
      usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    };
  }
  return null;
}

// Resource timing monitoring
export function measureResourceTiming() {
  if (typeof window === 'undefined') return;

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

  return resources.map(resource => ({
    name: resource.name,
    duration: resource.duration,
    size: resource.transferSize,
    type: getResourceType(resource.name),
    cached: resource.transferSize === 0 && resource.decodedBodySize > 0
  }));
}

function getResourceType(url: string): string {
  if (url.includes('.css')) return 'stylesheet';
  if (url.includes('.js')) return 'script';
  if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return 'image';
  if (url.includes('/api/')) return 'api';
  return 'other';
}

// Intersection Observer for lazy loading performance
export function createIntersectionObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
) {
  if (typeof window === 'undefined' || !window.IntersectionObserver) {
    return null;
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px',
    ...options
  });
}

// Debounce function for performance optimization
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function for performance optimization
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}