import { useEffect, useState, type KeyboardEvent } from "react";
import type { AnnotationLink, AnnotationResult } from "@/types";
import { AnnotationLinks } from "./AnnotationLinks";
import { AnnotationMeta } from "./AnnotationMeta";
import { MeToSixView } from "./MeToSixView";
import { SixToMeView } from "./SixToMeView";
import { StreamingText } from "./StreamingText";

interface AnnotationPanelProps {
  query: string;
  annotation: AnnotationResult | null;
  isLoading: boolean;
  error: Error | null;
  targetLabel?: string | null;
  onWikiNavigate: (link: AnnotationLink) => void;
  onRetry?: () => void;
  idPrefix?: string;
  placement?: "desktop" | "mobile";
}

type AnnotationTab = "sixToMe" | "meToSix";

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

export function AnnotationPanel({
  query,
  annotation,
  isLoading,
  error,
  targetLabel,
  onWikiNavigate,
  onRetry,
  idPrefix = "annotation",
  placement = "desktop",
}: AnnotationPanelProps) {
  const [activeTab, setActiveTab] = useState<AnnotationTab>("sixToMe");
  const isMobile = placement === "mobile";
  const errorMessage = targetLabel
    ? `未能为${targetLabel}生成注语。${error?.message ?? ""}`
    : error?.message;

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
  }, [annotation]);

  if (error) {
    return (
      <div
        role="alert"
        className="annotation-panel overflow-hidden border-y border-stone-800 bg-stone-950/45 text-stone-100"
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
      <div className="annotation-panel overflow-hidden bg-stone-950/85 text-stone-100">
        <div className={isMobile ? "p-4" : "p-6"}>
          <div className={`flex items-center justify-between gap-4 ${isMobile ? "mb-4" : "mb-6"}`}>
            <h2 className={`${isMobile ? "text-base" : "text-xl"} font-bold text-paper font-classic`}>注我卷轴</h2>
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

            <StreamingText
              isLoading={isLoading}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-panel overflow-hidden bg-stone-950/85 text-stone-100">
      {isMobile ? (
        <h2 className="sr-only">注我卷轴</h2>
      ) : (
        <div className="border-b border-stone-800 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-paper font-classic">注我卷轴</h2>
            <AnnotationMeta annotation={annotation} targetLabel={targetLabel} />
          </div>
        </div>
      )}

      <div className={isMobile ? "sr-only" : "px-6 pt-6"}>
        <section className="border-l-2 border-seal/70 pl-4">
          <div className="mb-2 text-xs tracking-[0.24em] text-seal">卷首 · 此刻一念</div>
          <div className="text-paper font-classic">{query}</div>
        </section>
      </div>

      {!isMobile && (
        <div className="px-6 pt-6">
          <div role="tablist" aria-label="注释视角" className="flex border-y border-stone-800 bg-stone-950/45 p-1">
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
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                  activeTab === tab.id
                    ? "bg-zen text-ink shadow-sm"
                    : "text-stone-400 hover:text-paper"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={isMobile ? "px-4 pb-4 pt-3" : "p-6"}>
        <div className={isMobile ? "sr-only" : "mb-5 flex items-center gap-3 text-xs tracking-[0.24em] text-seal"}>
          <span className="font-seal text-lg">注</span>
          <span>正文 · 双向互注</span>
        </div>
        <div className="space-y-6">
          {isMobile ? (
            <section aria-label={ANNOTATION_TABS.find(tab => tab.id === activeTab)?.label ?? "注语正文"} className="space-y-6">
              {activeTab === "sixToMe" ? (
                <SixToMeView text={annotation.sixToMe} isLoading={isLoading} />
              ) : (
                <MeToSixView text={annotation.meToSix} isLoading={isLoading} />
              )}
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === "sixToMe" ? "meToSix" : "sixToMe")}
                className="inline-flex min-h-11 items-center border-b border-stone-700 px-1 text-xs tracking-[0.18em] text-stone-400 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                {activeTab === "sixToMe" ? "转看我注六经" : "转看六经注我"}
              </button>
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
                  <SixToMeView text={annotation.sixToMe} isLoading={isLoading} />
                ) : (
                  <MeToSixView text={annotation.meToSix} isLoading={isLoading} />
                )}
              </div>
            ))
          )}

          {annotation.links.length > 0 && (
            <AnnotationLinks
              links={annotation.links}
              onNavigate={onWikiNavigate}
            />
          )}

        </div>
      </div>

      {annotation.links.length === 0 && (
        <div className="border-t border-stone-800 bg-stone-900/40 p-6">
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
    </div>
  );
}
