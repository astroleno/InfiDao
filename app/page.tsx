"use client";

import { useState, useCallback, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchResults } from '@/components/search/SearchResults';
import { AnnotationPanel } from '@/components/annotation/AnnotationPanel';
import { WikiExplorer } from '@/components/infinite-wiki/WikiExplorer';
import { useSearchStore } from '@/lib/stores/searchStore';
import { useAnnotationStore } from '@/lib/stores/annotationStore';
import { useUIStore } from '@/lib/stores/uiStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoadingSkeleton } from '@/components/ui/Loading';

export default function Home() {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);

  // Zustand stores
  const {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    isLoading: searchLoading,
    error: searchError,
    search,
    clearResults
  } = useSearchStore();

  const {
    currentAnnotation,
    isLoading: annotationLoading,
    error: annotationError,
    stream,
    clearAnnotation
  } = useAnnotationStore();

  const {
    showWiki,
    wikiNodes,
    toggleWiki,
    addToWiki
  } = useUIStore();

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    try {
      await search(query, filters);
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, [query, filters, search]);

  // Handle annotation request
  const handleAnnotate = useCallback(async (passageId: string, passageText: string) => {
    setSelectedPassage(passageId);
    setIsAnnotating(true);

    try {
      await stream({
        query,
        passage: passageText,
        model: 'glm' // Default model
      });
    } catch (error) {
      console.error('Annotation failed:', error);
      setIsAnnotating(false);
    }
  }, [query, stream]);

  // Handle annotation completion
  useEffect(() => {
    if (currentAnnotation && !annotationLoading) {
      setIsAnnotating(false);
    }
  }, [currentAnnotation, annotationLoading]);

  // Handle infinite wiki navigation
  const handleWikiNavigation = useCallback((passageId: string) => {
    addToWiki({
      id: passageId,
      query,
      timestamp: new Date().toISOString()
    });
    toggleWiki(true);
  }, [query, addToWiki, toggleWiki]);

  return (
    <ErrorBoundary>
      <MainLayout>
        {/* Search Section */}
        <div className="search-section">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSearch={handleSearch}
            isLoading={searchLoading}
            placeholder="输入您的想法或问题..."
          />

          <SearchFilters
            filters={filters}
            onChange={setFilters}
            onClear={() => setFilters({})}
          />
        </div>

        {/* Main Content Area */}
        <div className="main-content flex gap-6">
          {/* Left Column: User Input & Search Results */}
          <div className="left-column flex-1 space-y-6">
            {/* Search Results */}
            {searchLoading && !results.length && (
              <LoadingSkeleton type="search" />
            )}

            {searchError && (
              <div className="error-message bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                搜索失败：{searchError.message}
              </div>
            )}

            <SearchResults
              results={results}
              query={query}
              onAnnotate={handleAnnotate}
              onWikiNavigate={handleWikiNavigation}
              isAnnotating={isAnnotating}
              selectedPassage={selectedPassage}
            />
          </div>

          {/* Right Column: Annotations */}
          <div className="right-column flex-1">
            {isAnnotating && (
              <AnnotationPanel
                query={query}
                annotation={currentAnnotation}
                isLoading={annotationLoading}
                error={annotationError}
                onWikiNavigate={handleWikiNavigation}
              />
            )}

            {!isAnnotating && !currentAnnotation && (
              <div className="annotation-placeholder bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-500">
                <h3 className="text-lg font-medium mb-2">六经注我</h3>
                <p className="text-sm">
                  搜索并选择一段经文，生成双向注释<br />
                  体验"我注六经，六经注我"的智慧对话
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Infinite Wiki Explorer (Modal/Overlay) */}
        {showWiki && (
          <WikiExplorer
            nodes={wikiNodes}
            onClose={() => toggleWiki(false)}
            onSelectPassage={handleAnnotate}
          />
        )}
      </MainLayout>
    </ErrorBoundary>
  );
}