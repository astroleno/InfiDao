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
  onWikiNavigate: (link: AnnotationLink) => void;
  onRetry?: () => void;
  idPrefix?: string;
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
  onWikiNavigate,
  onRetry,
  idPrefix = "annotation",
}: AnnotationPanelProps) {
  const [activeTab, setActiveTab] = useState<AnnotationTab>("sixToMe");
  const activePanelId = `${idPrefix}-${activeTab}-panel`;

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
        className="annotation-panel overflow-hidden rounded-xl border border-red-900/50 bg-red-950/25 text-stone-100 shadow-sm"
      >
        <div className="p-6 text-center">
          <div className="mb-4 text-red-300">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-red-100">注释生成失败</h3>
          <p className="text-sm text-red-200/80">{error.message}</p>
          {onRetry && (
            <button
              type="button"
              className="mt-4 rounded-full border border-red-800 px-4 py-2 text-sm text-red-100 transition hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-ink"
              onClick={onRetry}
            >
              重试当前段落
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading || !annotation) {
    return (
      <div className="annotation-panel overflow-hidden rounded-xl border border-stone-800 bg-stone-950/85 text-stone-100 shadow-sm">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-paper font-classic">六经注我</h2>
            <div
              role="status"
              aria-label="注释生成状态"
              aria-live="polite"
              className="flex items-center text-sm text-stone-400"
            >
              <div className="animate-pulse mr-2">正在生成注释...</div>
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-zen"></div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">
              <div className="mb-2 text-sm font-medium text-zen">您的思考</div>
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
    <div className="annotation-panel overflow-hidden rounded-xl border border-stone-800 bg-stone-950/85 text-stone-100 shadow-sm">
      <div className="border-b border-stone-800 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-paper font-classic">六经注我</h2>
          <AnnotationMeta annotation={annotation} />
        </div>
      </div>

      <div className="p-6 pb-0">
        <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">
          <div className="mb-2 text-sm font-medium text-zen">您的思考</div>
          <div className="text-paper font-classic">{query}</div>
        </div>
      </div>

      <div className="px-6 pt-6">
        <div role="tablist" aria-label="注释视角" className="flex space-x-1 rounded-lg border border-stone-800 bg-stone-900 p-1">
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
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
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

      <div className="p-6">
        <div
          id={activePanelId}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-${activeTab}-tab`}
          className="space-y-6"
        >
          {activeTab === "sixToMe" ? (
            <SixToMeView text={annotation.sixToMe} isLoading={isLoading} />
          ) : (
            <MeToSixView text={annotation.meToSix} isLoading={isLoading} />
          )}

          {annotation.links.length > 0 && (
            <AnnotationLinks
              links={annotation.links}
              onNavigate={onWikiNavigate}
            />
          )}

          {annotation.links.length === 0 && (
            <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-4">
              <h3 className="text-base font-semibold text-paper font-classic">此处暂无后续探索</h3>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                可以返回上一层，或从左侧搜索结果重新选择一段经典回应。
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-stone-800 bg-stone-900/60 p-6">
        <div className="text-sm text-stone-400">
          {annotation.links.length === 0
            ? "当前节点已经到达叶子层，可以返回上一层或重新搜索。"
            : "点击延伸入口，可以继续进入下一层经典回应。"}
        </div>
      </div>
    </div>
  );
}
