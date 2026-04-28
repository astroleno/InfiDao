"use client";

import { useState } from "react";
import { AnnotationLink, AnnotationResult, ApiResponse, SearchResult } from "@/types";
import { AnnotationPanel } from "@/components/annotation/AnnotationPanel";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { WikiPanel } from "@/components/wiki/WikiPanel";
import {
  createWikiRoot,
  currentWikiNode,
  popWikiStack,
  pushWikiNode,
  resetWikiStack,
  type WikiStack,
} from "@/lib/wiki/service";

const HOME_SEARCH_THRESHOLD = 0.35;

function buildAtmosphere(query: string, results: SearchResult[]) {
  const trimmedQuery = query.trim();
  const firstResult = results[0];

  if (!trimmedQuery && !firstResult) {
    return {
      main: "念",
      accents: ["六经", "回应", "此刻一念"],
    };
  }

  return {
    main: firstResult?.source ?? (trimmedQuery.slice(0, 2) || "念"),
    accents: [
      trimmedQuery.slice(0, 6) || "此刻一念",
      firstResult?.chapter ?? "经典回应",
      firstResult?.source ?? "六经注我",
    ],
  };
}

function buildVisitedPassageIds(stack: WikiStack, nextPassageId: string): string[] {
  return [...new Set([...stack.map(node => node.annotation.passageId), nextPassageId])];
}

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationResult | null>(null);
  const [annotationError, setAnnotationError] = useState<Error | null>(null);
  const [wikiStack, setWikiStack] = useState<WikiStack>([]);

  const handleSearch = async (queryOverride?: string) => {
    const nextQuery = (queryOverride ?? searchQuery).trim();

    if (!nextQuery) {
      return;
    }

    setSearchQuery(nextQuery);
    setSearchError(null);
    setAnnotation(null);
    setAnnotationError(null);
    setWikiStack(resetWikiStack());
    setSelectedPassage(null);
    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: nextQuery,
          topK: 5,
          threshold: HOME_SEARCH_THRESHOLD,
        }),
      });

      const payload = (await response.json()) as ApiResponse<SearchResult[]>;

      if (!response.ok || !payload.success) {
        setSearchResults([]);
        setSearchError(payload.success ? "搜索尚未就绪。" : payload.error.message);
        return;
      }

      setSearchResults(payload.data);
    } catch {
      setSearchResults([]);
      setSearchError("搜索请求失败，请稍后再试。");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnnotate = async (passageId: string, passageText: string) => {
    if (!searchQuery.trim()) {
      return;
    }

    setSelectedPassage(passageId);
    setAnnotation(null);
    setAnnotationError(null);
    setWikiStack(resetWikiStack());
    setIsAnnotating(true);

    try {
      const response = await fetch("/api/annotate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          passageId,
          passageText,
          style: "modern",
          visitedPassageIds: [passageId],
        }),
      });

      const payload = (await response.json()) as ApiResponse<AnnotationResult>;

      if (!response.ok || !payload.success) {
        setAnnotationError(new Error(payload.success ? "注释尚未就绪。" : payload.error.message));
        return;
      }

      setAnnotation(payload.data);
      setWikiStack(createWikiRoot(searchQuery, payload.data));
    } catch {
      setAnnotationError(new Error("注释请求失败，请稍后再试。"));
    } finally {
      setIsAnnotating(false);
    }
  };

  const handleWikiNavigate = (link: AnnotationLink) => {
    const nextQuery = searchQuery.trim();

    if (!nextQuery) {
      return;
    }

    setSelectedPassage(link.passageId);
    setAnnotation(null);
    setAnnotationError(null);
    setIsAnnotating(true);

    void (async () => {
      try {
        const response = await fetch("/api/annotate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: nextQuery,
            passageId: link.passageId,
            passageText: link.passageText,
            style: "modern",
            visitedPassageIds: buildVisitedPassageIds(wikiStack, link.passageId),
          }),
        });

        const payload = (await response.json()) as ApiResponse<AnnotationResult>;

        if (!response.ok || !payload.success) {
          setAnnotationError(new Error(payload.success ? "注释尚未就绪。" : payload.error.message));
          return;
        }

        setAnnotation(payload.data);
        setWikiStack((currentStack) =>
          pushWikiNode(currentStack, {
            query: nextQuery,
            annotation: payload.data,
            via: link,
          }),
        );
      } catch {
        setAnnotationError(new Error("注释请求失败，请稍后再试。"));
      } finally {
        setIsAnnotating(false);
      }
    })();
  };

  const handleWikiBack = () => {
    setWikiStack((currentStack) => {
      const nextStack = popWikiStack(currentStack);
      const nextNode = currentWikiNode(nextStack);

      setAnnotation(nextNode?.annotation ?? null);
      setAnnotationError(null);
      setSelectedPassage(nextNode?.annotation.passageId ?? null);

      return nextStack;
    });
  };

  const resetHome = () => {
    setHasSearched(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setAnnotation(null);
    setAnnotationError(null);
    setWikiStack(resetWikiStack());
    setSelectedPassage(null);
  };

  const atmosphere = buildAtmosphere(searchQuery, searchResults);

  return (
    <div className="relative min-h-screen overflow-hidden ritual-shell text-paper">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 page-vignette" />
        <div className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 text-center">
          <span className="font-classic text-[8rem] leading-none text-stone-900/75 blur-[2px] md:text-[14rem] lg:text-[20rem]">
            {atmosphere.main}
          </span>
        </div>
        {atmosphere.accents.map((accent, index) => (
          <div
            key={`${accent}-${index}`}
            className={`absolute font-classic text-stone-800/55 blur-[1px] ${
              index === 0
                ? "left-[8%] top-[14%] text-3xl md:text-5xl"
                : index === 1
                  ? "right-[8%] top-[22%] text-2xl md:text-4xl"
                  : "bottom-[16%] right-[12%] text-3xl md:text-5xl"
            }`}
          >
            {accent}
          </div>
        ))}
      </div>

      <main className="relative z-10">
        {!hasSearched && (
          <section className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
            <div className="mb-6 inline-flex items-center rounded-full border border-stone-800 px-4 py-1 text-xs tracking-[0.32em] text-stone-500">
              INFIDAO
            </div>
            <div className="w-full max-w-4xl text-center">
              <h1 className="text-6xl font-bold tracking-tight text-paper font-classic md:text-8xl">六经注我</h1>
              <p className="mt-5 text-lg italic tracking-[0.14em] text-stone-400 font-classic md:text-2xl">
                输入此刻一念，经典开始回应
              </p>
              <p className="mx-auto mt-6 max-w-2xl text-sm leading-8 tracking-[0.06em] text-stone-500 md:text-base">
                输入一念，先听见经典回应；再沿注释与延伸入口，一层一层进入自己的探索路径。
              </p>
            </div>

            <div className="mt-14 w-full max-w-3xl">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleSearch}
                isLoading={isSearching}
                placeholder="输入此刻的一念..."
                mode="intro"
              />
            </div>
            <div className="mt-12 text-xs tracking-[0.26em] text-stone-600">按回车注入思想流</div>
          </section>
        )}

        {hasSearched && (
          <section className="min-h-screen px-6 pb-16 pt-6 md:px-8 md:pt-8">
            <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
              <button
                onClick={resetHome}
                className="inline-flex items-center gap-2 rounded-full border border-stone-800 px-4 py-2 text-xs tracking-[0.24em] text-stone-400 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                回到一念
              </button>
              <div className="text-right text-xs tracking-[0.26em] text-stone-600">PHASE 5 / INTERACTION POLISH</div>
            </div>

            <div className="mx-auto mt-8 max-w-4xl text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">此刻一念</p>
              <h2 className="mt-3 text-3xl leading-tight text-paper font-classic md:text-5xl">{searchQuery}</h2>

              <div className="mt-10">
                <SearchBar
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  isLoading={isSearching}
                  mode="inline"
                />
              </div>

            </div>

            {isSearching ? (
              <div className="mx-auto mt-24 flex max-w-2xl flex-col items-center gap-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-stone-800 bg-stone-950/70 text-zen motion-safe:animate-breath">
                  <div className="h-8 w-8 rounded-full border-2 border-stone-700 border-t-zen motion-safe:animate-spin" />
                </div>
                <div>
                  <div className="text-lg text-paper font-classic">经典正在凝神回应</div>
                  <p className="mt-2 text-sm leading-7 text-stone-500">“{searchQuery}” 已入流，正在比对语义与原文。</p>
                </div>
              </div>
            ) : searchError ? (
              <div className="mx-auto mt-20 max-w-2xl rounded-[2rem] border border-red-900/40 bg-red-950/20 px-6 py-8 text-center">
                <div className="text-xs uppercase tracking-[0.32em] text-red-300/70">Search Error</div>
                <p className="mt-4 text-lg text-red-100 font-classic">经典暂时未能回应</p>
                <p className="mt-3 text-sm leading-7 text-red-200/80">{searchError}</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start">
                <SearchResults
                  results={searchResults}
                  query={searchQuery}
                  onAnnotate={handleAnnotate}
                  isAnnotating={isAnnotating}
                  selectedPassage={selectedPassage}
                />

                {(selectedPassage || annotation || isAnnotating || annotationError) && (
                  <aside className="lg:sticky lg:top-8">
                    <WikiPanel stack={wikiStack} onBack={handleWikiBack} />
                    <AnnotationPanel
                      query={searchQuery}
                      annotation={annotation}
                      isLoading={isAnnotating}
                      error={annotationError}
                      onWikiNavigate={handleWikiNavigate}
                    />
                  </aside>
                )}
              </div>
            ) : (
              <div className="mx-auto mt-20 max-w-2xl rounded-[2rem] border border-stone-800 bg-stone-950/55 px-6 py-10 text-center">
                <div className="text-xs uppercase tracking-[0.32em] text-stone-500">No Match Yet</div>
                <p className="mt-4 text-2xl text-paper font-classic">这一念暂未听见回响</p>
                <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-stone-400">
                  换一种说法，或把问题说得更具体一些。当前先保留克制的搜索入口，不再展示额外营销模块。
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
