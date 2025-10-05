import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { SearchResult, SearchOptions } from '@/types';

interface SearchState {
  // State
  query: string;
  results: SearchResult[];
  filters: SearchOptions['filters'];
  isLoading: boolean;
  error: Error | null;
  searchHistory: Array<{
    query: string;
    timestamp: string;
    resultCount: number;
  }>;

  // Actions
  setQuery: (query: string) => void;
  setFilters: (filters: SearchOptions['filters']) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setResults: (results: SearchResult[]) => void;
  clearResults: () => void;
  addToHistory: (query: string, resultCount: number) => void;
  clearHistory: () => void;

  // Async Actions
  search: (query: string, options?: SearchOptions) => Promise<void>;
  searchMore: () => Promise<void>;
}

export const useSearchStore = create<SearchState>()(
  devtools(
    (set, get) => ({
      // Initial State
      query: '',
      results: [],
      filters: {},
      isLoading: false,
      error: null,
      searchHistory: [],

      // Actions
      setQuery: (query) => set({ query }),

      setFilters: (filters) => set({ filters }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setResults: (results) => set({ results }),

      clearResults: () => set({ results: [], error: null }),

      addToHistory: (query, resultCount) => set((state) => ({
        searchHistory: [
          {
            query,
            timestamp: new Date().toISOString(),
            resultCount
          },
          ...state.searchHistory.slice(0, 19) // Keep last 20 searches
        ]
      })),

      clearHistory: () => set({ searchHistory: [] }),

      // Async Actions
      search: async (query, options = {}) => {
        const { setQuery, setLoading, setError, setResults, addToHistory } = get();

        setQuery(query);
        setLoading(true);
        setError(null);

        try {
          const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              top_k: options.top_k || 5,
              threshold: options.threshold || 0.7,
              hybrid: options.hybrid !== false,
              filters: options.filters || {}
            }),
          });

          if (!response.ok) {
            throw new Error(`Search failed: ${response.statusText}`);
          }

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error?.message || 'Search failed');
          }

          setResults(data.results || []);
          addToHistory(query, data.results?.length || 0);
        } catch (error) {
          console.error('Search error:', error);
          setError(error instanceof Error ? error : new Error('Search failed'));
          setResults([]);
        } finally {
          setLoading(false);
        }
      },

      searchMore: async () => {
        const { query, results, filters, isLoading, search } = get();

        if (isLoading || results.length === 0) return;

        // Load more results with higher top_k
        const currentTopK = Math.ceil(results.length / 5) * 5;
        await search(query, {
          top_k: currentTopK + 5,
          filters
        });
      }
    }),
    {
      name: 'search-store',
    }
  )
);