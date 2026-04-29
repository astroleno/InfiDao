"use client";

import { useEffect, useRef, useState } from "react";
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
  type WikiNode,
  type WikiStack,
} from "@/lib/wiki/service";

const HOME_SEARCH_THRESHOLD = 0.35;

type AnnotationRetryTarget =
  | {
      kind: "root";
      passageId: string;
      passageText: string;
    }
  | {
      kind: "link";
      link: AnnotationLink;
    };

function SearchLoadingState({ query }: { query: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="搜索进行中"
      className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start"
    >
      <div className="flex w-full flex-col gap-8 md:gap-10">
        <div className="text-center">
          <div className="mx-auto h-3 w-24 rounded-full bg-stone-800 motion-safe:animate-pulse" />
          <div className="mx-auto mt-4 h-8 w-72 max-w-full rounded-full bg-stone-800/90 motion-safe:animate-pulse" />
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-500">
            “{query}” 已入流，正在比对语义与原文。
          </p>
        </div>

        <div className="space-y-6 md:space-y-10">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="mx-auto w-full max-w-3xl border border-stone-800/80 bg-stone-950/68 px-6 py-12 text-center md:px-10 md:py-16"
            >
              <div className="mx-auto mb-10 h-4 w-56 max-w-full rounded-full bg-stone-800 motion-safe:animate-pulse" />
              <div className="mx-auto h-8 w-4/5 rounded-full bg-stone-800/90 motion-safe:animate-pulse" />
              <div className="mx-auto mt-5 h-8 w-2/3 rounded-full bg-stone-800/80 motion-safe:animate-pulse" />
              <div className="mx-auto mt-10 h-4 w-72 max-w-full rounded-full bg-stone-800/70 motion-safe:animate-pulse" />
              <div className="mx-auto mt-10 h-12 w-44 rounded-full border border-stone-800 bg-stone-900/80 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="rounded-xl border border-stone-800 bg-stone-950/85 p-6">
          <div className="h-5 w-24 rounded-full bg-stone-800 motion-safe:animate-pulse" />
          <div className="mt-6 h-24 rounded-lg bg-stone-900/80 motion-safe:animate-pulse" />
          <div className="mt-6 h-10 rounded-lg bg-stone-900/80 motion-safe:animate-pulse" />
          <div className="mt-6 space-y-3">
            <div className="h-4 rounded-full bg-stone-800 motion-safe:animate-pulse" />
            <div className="h-4 w-5/6 rounded-full bg-stone-800 motion-safe:animate-pulse" />
            <div className="h-4 w-2/3 rounded-full bg-stone-800 motion-safe:animate-pulse" />
          </div>
        </div>
      </aside>
    </div>
  );
}

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

function formatPassageTargetLabel(target: {
  passageId: string;
  source?: string | undefined;
  chapter?: string | undefined;
  section?: number | undefined;
}) {
  if (target.source && target.chapter && typeof target.section === "number") {
    return `《${target.source}·${target.chapter}》第 ${target.section} 节`;
  }

  return "当前段落";
}

function formatSearchResultTargetLabel(results: SearchResult[], passageId: string) {
  const result = results.find(item => item.id === passageId);

  return formatPassageTargetLabel({
    passageId,
    source: result?.source,
    chapter: result?.chapter,
    section: result?.section,
  });
}

function formatLinkTargetLabel(link: AnnotationLink) {
  return formatPassageTargetLabel({
    passageId: link.passageId,
    source: link.source,
    chapter: link.chapter,
    section: link.section,
  });
}

function formatWikiNodeTargetLabel(node: WikiNode, results: SearchResult[]) {
  if (node.via) {
    return formatLinkTargetLabel(node.via);
  }

  return formatSearchResultTargetLabel(results, node.annotation.passageId);
}

function useIsDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncLayout = () => setIsDesktop(mediaQuery.matches);

    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);

    return () => {
      mediaQuery.removeEventListener("change", syncLayout);
    };
  }, []);

  return isDesktop;
}

export default function HomePage() {
  const annotationRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const retryTargetRef = useRef<AnnotationRetryTarget | null>(null);
  const mobileAnnotationSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [pendingAnnotationPassageId, setPendingAnnotationPassageId] = useState<string | null>(null);
  const [selectedPassage, setSelectedPassage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationResult | null>(null);
  const [annotationError, setAnnotationError] = useState<Error | null>(null);
  const [annotationTargetLabel, setAnnotationTargetLabel] = useState<string | null>(null);
  const [selectedResultPassage, setSelectedResultPassage] = useState<string | null>(null);
  const [wikiStack, setWikiStack] = useState<WikiStack>([]);
  const isDesktopLayout = useIsDesktopLayout();
  const hasAnnotationSurface =
    selectedPassage !== null || annotation !== null || isAnnotating || annotationError !== null;

  useEffect(() => {
    return () => {
      annotationRequestRef.current.controller?.abort();
    };
  }, []);

  useEffect(() => {
    if (isDesktopLayout || !hasAnnotationSurface || selectedResultPassage === null) {
      return undefined;
    }

    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame
        : window.clearTimeout;
    const frame = scheduleFrame(() => {
      mobileAnnotationSurfaceRef.current?.scrollIntoView?.({
        block: "start",
        behavior: "smooth",
      });
    });

    return () => {
      cancelFrame(frame);
    };
  }, [hasAnnotationSurface, isDesktopLayout, selectedResultPassage]);

  const cancelAnnotationRequest = () => {
    annotationRequestRef.current.controller?.abort();
    annotationRequestRef.current = {
      id: annotationRequestRef.current.id + 1,
      controller: null,
    };
    setIsAnnotating(false);
    setPendingAnnotationPassageId(null);
  };

  const beginAnnotationRequest = (passageId: string) => {
    annotationRequestRef.current.controller?.abort();

    const nextRequest = {
      id: annotationRequestRef.current.id + 1,
      controller: new AbortController(),
    };

    annotationRequestRef.current = nextRequest;
    setIsAnnotating(true);
    setPendingAnnotationPassageId(passageId);

    return nextRequest;
  };

  const isCurrentAnnotationRequest = (requestId: number) =>
    annotationRequestRef.current.id === requestId;

  const finishAnnotationRequest = (requestId: number) => {
    if (!isCurrentAnnotationRequest(requestId)) {
      return;
    }

    annotationRequestRef.current = {
      id: requestId,
      controller: null,
    };
    setIsAnnotating(false);
    setPendingAnnotationPassageId(null);
  };

  const handleSearch = async (queryOverride?: string) => {
    const nextQuery = (queryOverride ?? searchQuery).trim();

    if (!nextQuery) {
      return;
    }

    cancelAnnotationRequest();
    setSearchQuery(nextQuery);
    setSearchError(null);
    setAnnotation(null);
    setAnnotationError(null);
    setAnnotationTargetLabel(null);
    setWikiStack(resetWikiStack());
    setSelectedPassage(null);
    setSelectedResultPassage(null);
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

    const targetLabel = formatSearchResultTargetLabel(searchResults, passageId);
    const request = beginAnnotationRequest(passageId);
    retryTargetRef.current = {
      kind: "root",
      passageId,
      passageText,
    };
    setSelectedPassage(passageId);
    setSelectedResultPassage(passageId);
    setAnnotationTargetLabel(targetLabel);
    setAnnotation(null);
    setAnnotationError(null);
    setWikiStack(resetWikiStack());

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
        signal: request.controller.signal,
      });

      const payload = (await response.json()) as ApiResponse<AnnotationResult>;

      if (!isCurrentAnnotationRequest(request.id)) {
        return;
      }

      if (!response.ok || !payload.success) {
        setAnnotationError(new Error(payload.success ? "注释尚未就绪。" : payload.error.message));
        return;
      }

      setAnnotationError(null);
      setAnnotation(payload.data);
      setWikiStack(createWikiRoot(searchQuery, payload.data));
    } catch (error) {
      if (!isCurrentAnnotationRequest(request.id) || request.controller.signal.aborted) {
        return;
      }

      setAnnotationError(new Error("注释请求失败，请稍后再试。"));
    } finally {
      finishAnnotationRequest(request.id);
    }
  };

  const handleWikiNavigate = (link: AnnotationLink) => {
    const nextQuery = searchQuery.trim();

    if (!nextQuery) {
      return;
    }

    const targetLabel = formatLinkTargetLabel(link);
    const request = beginAnnotationRequest(link.passageId);
    retryTargetRef.current = {
      kind: "link",
      link,
    };
    setSelectedPassage(link.passageId);
    setAnnotationTargetLabel(targetLabel);
    setAnnotation(null);
    setAnnotationError(null);

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
          signal: request.controller.signal,
        });

        const payload = (await response.json()) as ApiResponse<AnnotationResult>;

        if (!isCurrentAnnotationRequest(request.id)) {
          return;
        }

        if (!response.ok || !payload.success) {
          setAnnotationError(new Error(payload.success ? "注释尚未就绪。" : payload.error.message));
          return;
        }

        setAnnotationError(null);
        setAnnotation(payload.data);
        setWikiStack((currentStack) =>
          pushWikiNode(currentStack, {
            query: nextQuery,
            annotation: payload.data,
            via: link,
          }),
        );
      } catch (error) {
        if (!isCurrentAnnotationRequest(request.id) || request.controller.signal.aborted) {
          return;
        }

        setAnnotationError(new Error("注释请求失败，请稍后再试。"));
      } finally {
        finishAnnotationRequest(request.id);
      }
    })();
  };

  const handleWikiBack = () => {
    cancelAnnotationRequest();
    setWikiStack((currentStack) => {
      const nextStack = popWikiStack(currentStack);
      const nextNode = currentWikiNode(nextStack);

      setAnnotation(nextNode?.annotation ?? null);
      setAnnotationError(null);
      setSelectedPassage(nextNode?.annotation.passageId ?? null);
      setSelectedResultPassage(nextNode ? selectedResultPassage : null);
      setAnnotationTargetLabel(nextNode ? formatWikiNodeTargetLabel(nextNode, searchResults) : null);

      return nextStack;
    });
  };

  const handleAnnotationRetry = () => {
    const retryTarget = retryTargetRef.current;

    if (!retryTarget) {
      return;
    }

    if (retryTarget.kind === "root") {
      void handleAnnotate(retryTarget.passageId, retryTarget.passageText);
      return;
    }

    handleWikiNavigate(retryTarget.link);
  };

  const resetHome = () => {
    cancelAnnotationRequest();
    setHasSearched(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setAnnotation(null);
    setAnnotationError(null);
    setAnnotationTargetLabel(null);
    setWikiStack(resetWikiStack());
    setSelectedPassage(null);
    setSelectedResultPassage(null);
  };

  const atmosphere = buildAtmosphere(searchQuery, searchResults);
  const renderAnnotationSurface = (idPrefix: string, placement: "desktop" | "mobile") => (
    <div
      ref={placement === "mobile" ? mobileAnnotationSurfaceRef : undefined}
      className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950/85 text-stone-100 shadow-sm"
    >
      <WikiPanel stack={wikiStack} onBack={handleWikiBack} />
      <AnnotationPanel
        idPrefix={idPrefix}
        query={searchQuery}
        annotation={annotation}
        isLoading={isAnnotating}
        error={annotationError}
        targetLabel={annotationTargetLabel}
        onWikiNavigate={handleWikiNavigate}
        onRetry={handleAnnotationRetry}
      />
    </div>
  );

  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-hidden ritual-shell text-paper">
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
          <section className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
            <div className="mb-6 inline-flex items-center rounded-full border border-stone-800 px-4 py-1 text-xs tracking-[0.32em] text-stone-500">
              INFIDAO
            </div>
            <div className="w-full max-w-4xl text-center">
              <h1 className="text-6xl font-bold tracking-tight text-paper font-classic md:text-8xl">六经注我</h1>
              <p className="mt-5 text-lg italic tracking-[0.14em] text-stone-400 font-classic md:text-2xl">
                输入此刻一念，经典开始回应
              </p>
              <p className="mx-auto mt-6 max-w-2xl text-sm leading-8 tracking-[0.06em] text-stone-500 md:text-base">
                输入一念，先听见经典回应；再沿注语与延伸入口，一层一层进入自己的回响路径。
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
          <section className="min-h-screen min-h-[100dvh] px-6 pb-16 pt-6 md:px-8 md:pt-8">
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
              <div className="text-right text-xs tracking-[0.26em] text-stone-600">连续探索</div>
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
              <SearchLoadingState query={searchQuery} />
            ) : searchError ? (
              <div
                role="alert"
                className="mx-auto mt-20 max-w-2xl rounded-[2rem] border border-red-900/40 bg-red-950/20 px-6 py-8 text-center"
              >
                <div className="text-xs tracking-[0.32em] text-red-300/70">回响中断</div>
                <p className="mt-4 text-lg text-red-100 font-classic">经典暂时未能回应</p>
                <p className="mt-3 text-sm leading-7 text-red-200/80">{searchError}</p>
                <button
                  type="button"
                  onClick={() => void handleSearch(searchQuery)}
                  className="mt-6 rounded-full border border-red-800 px-5 py-2 text-sm text-red-100 transition hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-ink"
                >
                  重新搜索
                </button>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start">
                <SearchResults
                  results={searchResults}
                  query={searchQuery}
                  onAnnotate={handleAnnotate}
                  isAnnotating={isAnnotating}
                  pendingAnnotationPassageId={pendingAnnotationPassageId}
                  selectedPassage={selectedResultPassage}
                  activeAnnotationPassage={annotation?.passageId ?? null}
                  {...(hasAnnotationSurface && !isDesktopLayout
                    ? { renderActivePanel: resultId => renderAnnotationSurface(`annotation-mobile-${resultId}`, "mobile") }
                    : {})}
                />

                {hasAnnotationSurface && isDesktopLayout && (
                  <aside className="hidden lg:sticky lg:top-8 lg:block">
                    {renderAnnotationSurface("annotation-desktop", "desktop")}
                  </aside>
                )}
              </div>
            ) : (
              <div className="mx-auto mt-20 max-w-2xl rounded-[2rem] border border-stone-800 bg-stone-950/55 px-6 py-10 text-center">
                <div className="text-xs tracking-[0.32em] text-stone-500">暂未匹配</div>
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
