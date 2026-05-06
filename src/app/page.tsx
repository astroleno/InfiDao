"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
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

interface ActiveReadingTarget {
  passageId: string;
  label: string;
  text: string;
  resonanceLabel: string;
}

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

function ReaderStatePanel({
  eyebrow,
  title,
  body,
  tone = "neutral",
  role,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone?: "neutral" | "danger";
  role?: "alert";
  action?: ReactNode;
}) {
  const toneClasses = tone === "danger"
    ? "border-red-900/50 bg-reader-danger/35 text-red-100"
    : "border-reader-border bg-reader-surface/70 text-paper";
  const eyebrowClasses = tone === "danger" ? "text-red-300/75" : "text-reader-subdued";
  const bodyClasses = tone === "danger" ? "text-red-200/80" : "text-stone-400";

  return (
    <div
      role={role}
      className={`mx-auto mt-16 max-w-2xl border-y px-6 py-9 text-center ${toneClasses}`}
    >
      <div className={`text-xs tracking-[0.32em] ${eyebrowClasses}`}>{eyebrow}</div>
      <p className="mt-4 text-2xl text-paper font-classic">{title}</p>
      <p className={`mx-auto mt-4 max-w-xl text-sm leading-8 ${bodyClasses}`}>{body}</p>
      {action && <div className="mt-6">{action}</div>}
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

function getResonanceLabel(score: number) {
  if (score >= 0.85) {
    return "正中此念";
  }

  if (score >= 0.65) {
    return "可深读";
  }

  return "旁通一义";
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

function formatMobileReaderTargetLabel(label: string | null) {
  if (!label) {
    return "当前经文";
  }

  const passageMatch = label.match(/^《(.+?)·(.+?)》第\s*(\d+)\s*节$/u);
  if (!passageMatch) {
    return label;
  }

  return `${passageMatch[1]} ${passageMatch[2]}`;
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

function buildRootReadingTarget(
  results: SearchResult[],
  passageId: string,
  passageText: string,
): ActiveReadingTarget {
  const result = results.find(item => item.id === passageId);

  return {
    passageId,
    label: formatSearchResultTargetLabel(results, passageId),
    text: passageText,
    resonanceLabel: result ? getResonanceLabel(result.score) : "可深读",
  };
}

function buildLinkReadingTarget(link: AnnotationLink): ActiveReadingTarget {
  return {
    passageId: link.passageId,
    label: formatLinkTargetLabel(link),
    text: link.passageText,
    resonanceLabel: "由此进入",
  };
}

function buildWikiNodeReadingTarget(node: WikiNode, results: SearchResult[]): ActiveReadingTarget {
  if (node.via) {
    return buildLinkReadingTarget(node.via);
  }

  return buildRootReadingTarget(results, node.annotation.passageId, node.annotation.passageText);
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

function MobileAnnotationReader({
  readerRef,
  targetLabel,
  passageText,
  resonanceLabel,
  onBack,
  children,
}: {
  readerRef: Ref<HTMLDivElement>;
  targetLabel: string | null;
  passageText: string;
  resonanceLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const visibleTargetLabel = formatMobileReaderTargetLabel(targetLabel);
  const fullTargetLabel = targetLabel ?? "当前经文";

  return (
    <div
      ref={readerRef}
      role="region"
      aria-label="注我阅读视图"
      tabIndex={-1}
      className="mx-auto mt-8 w-full max-w-3xl focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zen/45 lg:hidden"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex min-h-11 items-center gap-2 border-b border-stone-700 px-3 py-2 text-xs tracking-[0.22em] text-stone-400 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        回到回应列表
      </button>

      <details className="sticky top-0 z-10 mb-3 border-y border-stone-800 bg-ink/95 backdrop-blur">
        <summary
          aria-label={`当前经文：${fullTargetLabel}，${resonanceLabel}。展开查看原文`}
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs tracking-[0.12em] text-stone-500 focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 flex-1 truncate">
            {visibleTargetLabel}
          </span>
          <span className="text-stone-600">·</span>
          <span className="shrink-0 text-xs tracking-[0.16em] text-zen">{resonanceLabel}</span>
        </summary>
        <blockquote className="border-t border-stone-800 px-3 py-3 text-sm leading-7 text-paper font-classic">
          <span className="sr-only">签 · {fullTargetLabel} · </span>
          {passageText}
        </blockquote>
      </details>

      {children}
    </div>
  );
}

export default function HomePage() {
  const annotationRequestRef = useRef<{
    id: number;
    controller: AbortController | null;
  }>({ id: 0, controller: null });
  const retryTargetRef = useRef<AnnotationRetryTarget | null>(null);
  const mobileAnnotationReaderRef = useRef<HTMLDivElement | null>(null);
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
  const [isMobileAnnotationReaderOpen, setIsMobileAnnotationReaderOpen] = useState(false);
  const [activeReadingTarget, setActiveReadingTarget] = useState<ActiveReadingTarget | null>(null);
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
    if (isDesktopLayout || !isMobileAnnotationReaderOpen || activeReadingTarget === null) {
      return undefined;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
    const cancelFrame =
      typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame
        : window.clearTimeout;
    const frame = scheduleFrame(() => {
      const reader = mobileAnnotationReaderRef.current;

      reader?.focus({ preventScroll: true });
      reader?.scrollIntoView?.({
        block: "start",
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    });

    return () => {
      cancelFrame(frame);
    };
  }, [activeReadingTarget, isDesktopLayout, isMobileAnnotationReaderOpen]);

  const focusResultAction = (passageId: string | null) => {
    if (!passageId) {
      return;
    }

    const scheduleFrame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);

    scheduleFrame(() => {
      document.getElementById(`annotation-action-${passageId}`)?.focus();
    });
  };

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
    setIsMobileAnnotationReaderOpen(false);
    setActiveReadingTarget(null);
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

    const readingTarget = buildRootReadingTarget(searchResults, passageId, passageText);

    if (annotation?.passageId === passageId) {
      retryTargetRef.current = {
        kind: "root",
        passageId,
        passageText,
      };
      setSelectedPassage(passageId);
      setSelectedResultPassage(passageId);
      setIsMobileAnnotationReaderOpen(true);
      setActiveReadingTarget(readingTarget);
      setAnnotationTargetLabel(readingTarget.label);
      setAnnotationError(null);
      return;
    }

    const request = beginAnnotationRequest(passageId);
    retryTargetRef.current = {
      kind: "root",
      passageId,
      passageText,
    };
    setSelectedPassage(passageId);
    setSelectedResultPassage(passageId);
    setIsMobileAnnotationReaderOpen(true);
    setActiveReadingTarget(readingTarget);
    setAnnotationTargetLabel(readingTarget.label);
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

    const readingTarget = buildLinkReadingTarget(link);
    const request = beginAnnotationRequest(link.passageId);
    retryTargetRef.current = {
      kind: "link",
      link,
    };
    setSelectedPassage(link.passageId);
    setIsMobileAnnotationReaderOpen(true);
    setActiveReadingTarget(readingTarget);
    setAnnotationTargetLabel(readingTarget.label);
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
      const nextReadingTarget = nextNode ? buildWikiNodeReadingTarget(nextNode, searchResults) : null;

      setActiveReadingTarget(nextReadingTarget);
      setAnnotationTargetLabel(nextReadingTarget?.label ?? null);

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
    setIsMobileAnnotationReaderOpen(false);
    setActiveReadingTarget(null);
  };

  const closeMobileAnnotationReader = () => {
    const passageId = selectedResultPassage;

    setIsMobileAnnotationReaderOpen(false);
    focusResultAction(passageId);
  };

  const atmosphere = buildAtmosphere(searchQuery, searchResults);
  const renderAnnotationSurface = (idPrefix: string, placement: "desktop" | "mobile") => (
    <div
      className={`overflow-hidden bg-stone-950/85 text-stone-100 shadow-sm ${
        placement === "mobile"
          ? "border-y border-stone-800"
          : "rounded-xl border border-stone-800"
      }`}
    >
      <WikiPanel stack={wikiStack} onBack={handleWikiBack} placement={placement} />
      <AnnotationPanel
        idPrefix={idPrefix}
        query={searchQuery}
        annotation={annotation}
        isLoading={isAnnotating}
        error={annotationError}
        targetLabel={annotationTargetLabel}
        onWikiNavigate={handleWikiNavigate}
        onRetry={handleAnnotationRetry}
        placement={placement}
      />
    </div>
  );
  const showMobileAnnotationReader =
    hasAnnotationSurface && !isDesktopLayout && isMobileAnnotationReaderOpen && activeReadingTarget !== null;

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
          <section className="flex min-h-screen min-h-[100dvh] flex-col items-center px-6 pb-8 pt-10 md:justify-center md:py-16">
            <div className="mb-6 inline-flex items-center rounded-full border border-stone-800 px-4 py-1 text-xs tracking-[0.32em] text-stone-500">
              INFIDAO
            </div>
            <div className="w-full max-w-4xl text-center">
              <h1 className="text-5xl font-bold tracking-tight text-paper font-classic md:text-8xl">六经注我</h1>
              <p className="mt-5 text-lg italic tracking-[0.14em] text-stone-400 font-classic md:text-2xl">
                输入此刻一念，经典开始回应
              </p>
              <p className="mx-auto mt-6 max-w-2xl text-sm leading-8 tracking-[0.06em] text-stone-500 md:text-base">
                输入一念，先听见经典回应；再沿注语与延伸入口，一层一层进入自己的回响路径。
              </p>
            </div>

            <div className="mt-10 w-full max-w-3xl md:mt-14">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={handleSearch}
                isLoading={isSearching}
                placeholder="输入此刻的一念..."
                mode="intro"
              />
            </div>
            <div className="mt-12 hidden text-xs tracking-[0.26em] text-stone-600 md:block">
              写下一念，按回车回应
            </div>
          </section>
        )}

        {hasSearched && (
          <section className="min-h-screen min-h-[100dvh] px-6 pb-16 pt-4 md:px-8 md:pt-8">
            <div className={`mx-auto max-w-5xl items-start justify-between gap-4 ${
              showMobileAnnotationReader ? "hidden md:flex" : "flex"
            }`}>
              <button
                onClick={resetHome}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-800 px-4 py-3 text-xs tracking-[0.24em] text-stone-400 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                回到一念
              </button>
              <div className="hidden text-right text-xs tracking-[0.26em] text-stone-600 md:block">连续探索</div>
            </div>

            <div className={`mx-auto max-w-4xl text-center md:mt-8 ${
              showMobileAnnotationReader ? "hidden md:block" : "mt-5"
            }`}>
              <p className="text-[0.65rem] uppercase tracking-[0.26em] text-stone-500 md:text-xs md:tracking-[0.3em]">此刻一念</p>
              <h2 className="mx-auto mt-2 max-w-2xl text-xl leading-snug text-paper font-classic md:mt-3 md:text-5xl md:leading-tight">
                {searchQuery}
              </h2>

              {!showMobileAnnotationReader && (
                <details className="mx-auto mt-4 max-w-2xl border-y border-stone-800 text-left md:hidden">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-4 py-3 text-center text-xs tracking-[0.24em] text-stone-400 transition hover:text-zen active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink [&::-webkit-details-marker]:hidden">
                    改写这一念
                  </summary>
                  <div className="mt-5">
                    <SearchBar
                      inputId="thought-query-mobile-inline"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      onSearch={handleSearch}
                      isLoading={isSearching}
                      mode="inline"
                      compact
                      showSuggestions={false}
                    />
                  </div>
                </details>
              )}

              <div className="mt-10 hidden md:block">
                <SearchBar
                  inputId="thought-query-inline"
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
              <ReaderStatePanel
                role="alert"
                tone="danger"
                eyebrow="回响中断"
                title="经典暂时未能回应"
                body={searchError}
                action={(
                  <button
                    type="button"
                    onClick={() => void handleSearch(searchQuery)}
                    className="inline-flex min-h-11 items-center justify-center border border-red-800 px-5 py-2 text-sm text-red-100 transition hover:border-red-400 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-ink"
                  >
                    重新搜索
                  </button>
                )}
              />
            ) : searchResults.length > 0 ? (
              showMobileAnnotationReader ? (
                <MobileAnnotationReader
                  readerRef={mobileAnnotationReaderRef}
                  targetLabel={activeReadingTarget!.label}
                  passageText={activeReadingTarget!.text}
                  resonanceLabel={activeReadingTarget!.resonanceLabel}
                  onBack={closeMobileAnnotationReader}
                >
                  {renderAnnotationSurface("annotation-mobile-reader", "mobile")}
                </MobileAnnotationReader>
              ) : (
                <div className="mx-auto mt-6 grid max-w-7xl gap-8 md:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start">
                  <SearchResults
                    results={searchResults}
                    query={searchQuery}
                    onAnnotate={handleAnnotate}
                    isAnnotating={isAnnotating}
                    pendingAnnotationPassageId={pendingAnnotationPassageId}
                    selectedPassage={selectedResultPassage}
                    activeAnnotationPassage={annotation?.passageId ?? null}
                  />

                  {hasAnnotationSurface && isDesktopLayout && (
                    <aside className="hidden lg:sticky lg:top-8 lg:block">
                      {renderAnnotationSurface("annotation-desktop", "desktop")}
                    </aside>
                  )}
                </div>
              )
            ) : (
              <ReaderStatePanel
                eyebrow="暂未匹配"
                title="这一念暂未听见回响"
                body="换一个更具体的处境，或回到一念重新发问。"
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
