import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import type { AnnotationLink, AnnotationResult } from "@/types";
import { AnnotationLinks } from "./AnnotationLinks";
import { MeToSixView } from "./MeToSixView";
import { SixToMeView } from "./SixToMeView";
import { StreamingText } from "./StreamingText";

interface AnnotationPanelProps {
  query: string;
  annotation: AnnotationResult | null;
  isLoading: boolean;
  error: Error | null;
  targetLabel?: string | null;
  activeTab?: AnnotationTab;
  onActiveTabChange?: (tab: AnnotationTab) => void;
  onWikiNavigate: (link: AnnotationLink) => void;
  onRetry?: () => void;
  idPrefix?: string;
  placement?: "desktop" | "mobile";
}

export type AnnotationTab = "sixToMe" | "meToSix";

const ANNOTATION_TABS: Array<{
  id: AnnotationTab;
  label: string;
}> = [
  {
    id: "sixToMe",
    label: "六经注我",
  },
  {
    id: "meToSix",
    label: "我注六经",
  },
];

const READING_STAGES = ["原句", "注我", "回注", "下一句"];

export function AnnotationPanel({
  query,
  annotation,
  isLoading,
  error,
  targetLabel,
  activeTab: controlledActiveTab,
  onActiveTabChange,
  onWikiNavigate,
  onRetry,
  idPrefix = "annotation",
  placement = "desktop",
}: AnnotationPanelProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<AnnotationTab>("sixToMe");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const isMobile = placement === "mobile";
  const errorMessage = targetLabel
    ? `未能为${targetLabel}生成注语。${error?.message ?? ""}`
    : error?.message;
  const firstFollowUpLink = annotation?.links[0] ?? null;
  const activeStageIndex = activeTab === "sixToMe" ? 1 : 2;
  const activeStageLabel = activeTab === "sixToMe" ? "2/4 · 注我" : "3/4 · 回注";

  const setActiveTab = useCallback(
    (tab: AnnotationTab) => {
      setInternalActiveTab(tab);
      onActiveTabChange?.(tab);
    },
    [onActiveTabChange],
  );

  const focusTab = (tab: AnnotationTab) => {
    setActiveTab(tab);
    const scheduleFocus =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);

    scheduleFocus(() => {
      document.getElementById(`${idPrefix}-${tab}-tab`)?.focus();
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = ANNOTATION_TABS.findIndex(tab => tab.id === activeTab);
    const lastIndex = ANNOTATION_TABS.length - 1;
    let nextTab: AnnotationTab | null = null;

    if (event.key === "ArrowRight") {
      nextTab = ANNOTATION_TABS[currentIndex === lastIndex ? 0 : currentIndex + 1]?.id ?? null;
    } else if (event.key === "ArrowLeft") {
      nextTab = ANNOTATION_TABS[currentIndex <= 0 ? lastIndex : currentIndex - 1]?.id ?? null;
    } else if (event.key === "Home") {
      nextTab = ANNOTATION_TABS[0]?.id ?? null;
    } else if (event.key === "End") {
      nextTab = ANNOTATION_TABS[lastIndex]?.id ?? null;
    }

    if (nextTab === null) {
      return;
    }

    event.preventDefault();
    focusTab(nextTab);
  };

  useEffect(() => {
    if (annotation?.sixToMe && !annotation?.meToSix) {
      setActiveTab("sixToMe");
    } else if (annotation?.meToSix && !annotation?.sixToMe) {
      setActiveTab("meToSix");
    }
  }, [annotation, setActiveTab]);

  if (error) {
    return (
      <div
        role="alert"
        className="annotation-panel overflow-hidden border-y border-stone-800/70 bg-stone-950/45 text-stone-100"
      >
        <div className="flex items-start gap-4 px-5 py-5">
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center border border-seal/60 text-seal font-seal">
            断
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg text-paper font-classic">注语未成</h3>
            <p className="mt-2 text-sm leading-7 text-stone-400">{errorMessage}</p>
            {onRetry && (
              <button
                type="button"
                className="mt-4 inline-flex min-h-11 items-center justify-center border-b border-seal/55 px-1 text-sm tracking-[0.12em] text-stone-300 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
                onClick={onRetry}
              >
                再取此义
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !annotation) {
    return (
      <div className="annotation-panel overflow-hidden bg-transparent text-stone-100">
        <div className={isMobile ? "p-4" : "p-6"}>
          <div className={`flex items-center justify-between gap-4 ${isMobile ? "mb-4" : "mb-6"}`}>
            <h2
              className={`${isMobile ? "text-base" : "text-xl"} font-bold text-paper font-classic`}
            >
              注我卷轴
            </h2>
            <div
              role="status"
              aria-label="注释生成状态"
              aria-live="polite"
              className="flex flex-wrap justify-end gap-2 text-xs text-stone-400"
            >
              {["取义中", "比照经文", "注语将成"].map(step => (
                <span
                  key={step}
                  className="border border-stone-800 px-2.5 py-1 motion-safe:animate-pulse"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>

          <div className={isMobile ? "space-y-4" : "space-y-8"}>
            <div className={isMobile ? "sr-only" : "border-l-2 border-seal/70 pl-4"}>
              <div className="mb-2 text-xs tracking-[0.24em] text-seal">卷首 · 此刻一念</div>
              <div className="text-paper font-classic">{query}</div>
            </div>

            <StreamingText isLoading={isLoading} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-panel overflow-hidden bg-transparent text-stone-100">
      {isMobile ? (
        <h2 className="sr-only">注我卷轴</h2>
      ) : (
        <div className="px-1 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="border-l border-seal/45 pl-3">
              <p className="text-[11px] tracking-[0.28em] text-stone-400">旁批</p>
              <h2 className="mt-1 text-lg font-bold text-paper font-classic">注我卷轴</h2>
            </div>
            <div className="max-w-44 text-right text-xs leading-5 text-stone-400">
              <span className="block text-zen/85">{activeStageLabel}</span>
              <span className="block truncate">{targetLabel ?? "当前经文"}</span>
            </div>
          </div>

          <div
            aria-label="当前阅读段落"
            className="mt-4 flex items-center justify-between border-l border-stone-800/70 px-3 py-1.5 text-[11px] tracking-[0.16em] text-stone-300"
          >
            <span>{activeTab === "sixToMe" ? "当前注语" : "当前回注"}</span>
            <span className="text-stone-600">·</span>
            <span className="text-zen/85">
              {annotation.links.length > 0 ? "下一句已备" : "此处暂止"}
            </span>
          </div>

          <details className="mt-3">
            <summary className="min-h-8 cursor-pointer list-none text-xs tracking-[0.18em] text-stone-500 transition hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink [&::-webkit-details-marker]:hidden">
              原句与段落标尺
            </summary>
            <section className="mt-3 border-l border-seal/60 pl-3">
              <div className="mb-1 text-[11px] tracking-[0.22em] text-seal">原句 · 此刻一念</div>
              <div className="text-sm leading-6 text-paper font-classic">{query}</div>
            </section>
            <div
              aria-label="完整阅读段落"
              className="mt-3 grid grid-cols-4 divide-x divide-stone-800/80 border-y border-stone-800/70 text-center text-[11px] tracking-[0.16em] text-stone-500"
            >
              {READING_STAGES.map((stage, index) => (
                <span
                  key={stage}
                  className={`px-2 py-2 ${index === activeStageIndex ? "bg-zen/10 text-zen" : ""}`}
                >
                  {stage}
                </span>
              ))}
            </div>
          </details>
        </div>
      )}

      {!isMobile && (
        <div className="px-1 pt-2">
          <div
            role="tablist"
            aria-label="注释视角"
            className="flex border-l border-stone-800/70 pl-2"
          >
            {ANNOTATION_TABS.map(tab => (
              <button
                key={tab.id}
                id={`${idPrefix}-${tab.id}-tab`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`${idPrefix}-${tab.id}-panel`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleTabKeyDown}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                  activeTab === tab.id ? "text-paper" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={isMobile ? "px-4 pb-4 pt-3" : "px-1 py-4"}>
        <div
          className={
            isMobile
              ? "sr-only"
              : "mb-4 flex items-center gap-3 border-l border-seal/45 pl-3 text-xs tracking-[0.22em] text-seal"
          }
        >
          <span className="font-seal text-lg">注</span>
          <span>注我 · 回注</span>
        </div>
        <div className="space-y-6">
          {isMobile ? (
            <section
              aria-label={ANNOTATION_TABS.find(tab => tab.id === activeTab)?.label ?? "注语正文"}
              className="space-y-6"
            >
              {activeTab === "sixToMe" ? (
                <SixToMeView
                  text={annotation.sixToMe}
                  isLoading={isLoading}
                  showGuidance={!isMobile}
                />
              ) : (
                <MeToSixView
                  text={annotation.meToSix}
                  isLoading={isLoading}
                  showGuidance={!isMobile}
                />
              )}
            </section>
          ) : (
            ANNOTATION_TABS.map(tab => (
              <div
                key={tab.id}
                id={`${idPrefix}-${tab.id}-panel`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-${tab.id}-tab`}
                hidden={activeTab !== tab.id}
                className="space-y-6"
              >
                {tab.id === "sixToMe" ? (
                  <SixToMeView
                    text={annotation.sixToMe}
                    isLoading={isLoading}
                    showGuidance={false}
                  />
                ) : (
                  <MeToSixView
                    text={annotation.meToSix}
                    isLoading={isLoading}
                    showGuidance={false}
                  />
                )}
              </div>
            ))
          )}

          {annotation.links.length > 0 && (
            <AnnotationLinks links={annotation.links} onNavigate={onWikiNavigate} />
          )}
        </div>
      </div>

      {annotation.links.length === 0 && (
        <div
          className={
            isMobile
              ? "border-t border-stone-800 bg-stone-900/40 p-6"
              : "border-l border-stone-800/70 px-3 py-4"
          }
        >
          <div className="flex items-start gap-3 text-sm text-stone-400">
            <span className="font-seal text-lg leading-none text-seal">止</span>
            <span>
              {isMobile
                ? "此处暂止，回到回应列表，或另择一句再入。"
                : "此处暂止，可返回上一层，或另择一段经典回应。"}
            </span>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="sticky bottom-0 z-10 border-t border-stone-800/70 bg-ink/92 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (firstFollowUpLink) {
                  onWikiNavigate(firstFollowUpLink);
                }
              }}
              disabled={!firstFollowUpLink}
              className="inline-flex min-h-10 flex-[1.35] items-center justify-center rounded-full border border-zen bg-zen px-4 py-2 text-center text-xs tracking-[0.16em] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:border-paper hover:bg-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:bg-transparent disabled:text-stone-600 disabled:shadow-none disabled:active:scale-100"
            >
              {firstFollowUpLink ? "下一句" : "此处暂止"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "sixToMe" ? "meToSix" : "sixToMe")}
              className="inline-flex min-h-10 flex-1 items-center justify-center border-b border-stone-700 px-2 py-2 text-center text-[11px] tracking-[0.12em] text-stone-200 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
            >
              {activeTab === "sixToMe" ? "看我的回注" : "看经典回应"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
