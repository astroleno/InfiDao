import { useState, useCallback, useRef } from 'react';
import { SearchResult, SearchOptions, ApiResponse } from '@/types';

interface UseSearchOptions {
  onSuccess?: (results: SearchResult[]) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
}

interface UseSearchReturn {
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  searchMore: () => Promise<SearchResult[]>;
  results: SearchResult[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  totalCount: number;
  clearResults: () => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const searchQueryRef = useRef<string>('');
  const searchOptionsRef = useRef<SearchOptions>({});
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const { onSuccess, onError, debounceMs = 300 } = options;

  const performSearch = useCallback(async (
    query: string,
    searchOptions: SearchOptions = {},
    append = false
  ): Promise<SearchResult[]> => {
    if (!query.trim()) {
      if (!append) {
        setResults([]);
        setTotalCount(0);
        setHasMore(false);
      }
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      const requestBody = {
        query: query.trim(),
        top_k: searchOptions.top_k || 5,
        threshold: searchOptions.threshold || 0.7,
        hybrid: searchOptions.hybrid !== false,
        filters: searchOptions.filters || {},
        weights: searchOptions.weights || {},
        rerank: searchOptions.rerank || false,
        expand_query: searchOptions.expand_query || false
      };

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`搜索请求失败: ${response.statusText}`);
      }

      const data: ApiResponse<SearchResult[]> = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || '搜索失败');
      }

      const searchResults = data.data || [];

      if (append) {
        setResults(prev => [...prev, ...searchResults]);
      } else {
        setResults(searchResults);
      }

      setTotalCount(searchResults.length);
      setHasMore(searchResults.length >= (searchOptions.top_k || 5));

      searchQueryRef.current = query;
      searchOptionsRef.current = searchOptions;

      onSuccess?.(searchResults);
      return searchResults;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('搜索失败');
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess, onError]);

  const search = useCallback((query: string, searchOptions?: SearchOptions) => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    return new Promise<SearchResult[]>((resolve, reject) => {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const results = await performSearch(query, searchOptions, false);
          resolve(results);
        } catch (error) {
          reject(error);
        }
      }, debounceMs);
    });
  }, [performSearch, debounceMs]);

  const searchMore = useCallback(async () => {
    if (!searchQueryRef.current || isLoading || !hasMore) {
      return results;
    }

    const currentTopK = searchOptionsRef.current.top_k || 5;
    const newTopK = currentTopK + 5;

    try {
      const newResults = await performSearch(
        searchQueryRef.current,
        {
          ...searchOptionsRef.current,
          top_k: newTopK
        },
        true
      );

      // Filter out duplicates
      const existingIds = new Set(results.map(r => r.id));
      const uniqueNewResults = newResults.filter(r => !existingIds.has(r.id));

      setResults(prev => [...prev, ...uniqueNewResults]);
      return uniqueNewResults;

    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }
  }, [performSearch, isLoading, hasMore, results]);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setHasMore(false);
    setTotalCount(0);
    searchQueryRef.current = '';
    searchOptionsRef.current = {};

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    search,
    searchMore,
    results,
    isLoading,
    error,
    hasMore,
    totalCount,
    clearResults
  };
}