import { useEffect, useState } from "react";
import type { AnnotationLink, AnnotationResult } from "@/types";
import { Button } from "@/components/ui/Button";
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
}

export function AnnotationPanel({
  query,
  annotation,
  isLoading,
  error,
  onWikiNavigate,
}: AnnotationPanelProps) {
  const [activeTab, setActiveTab] = useState<"sixToMe" | "meToSix">("sixToMe");

  useEffect(() => {
    if (annotation?.sixToMe && !annotation?.meToSix) {
      setActiveTab("sixToMe");
    } else if (annotation?.meToSix && !annotation?.sixToMe) {
      setActiveTab("meToSix");
    }
  }, [annotation]);

  if (error) {
    return (
      <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">注释生成失败</h3>
          <p className="text-gray-600 text-sm">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !annotation) {
    return (
      <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 font-classic">六经注我</h2>
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-pulse mr-2">正在生成注释...</div>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-sm text-amber-600 font-medium mb-2">您的思考</div>
              <div className="text-gray-900 font-classic">{query}</div>
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
    <div className="annotation-panel bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 font-classic">六经注我</h2>
          <AnnotationMeta annotation={annotation} />
        </div>
      </div>

      <div className="p-6 pb-0">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-600 font-medium mb-2">您的思考</div>
          <div className="text-gray-900 font-classic">{query}</div>
        </div>
      </div>

      <div className="px-6 pt-6">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("sixToMe")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "sixToMe"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            六经注我
          </button>
          <button
            onClick={() => setActiveTab("meToSix")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "meToSix"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            我注六经
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-6">
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
        </div>
      </div>

      <div className="p-6 border-t border-gray-100 bg-gray-50">
        <div className="text-sm text-gray-500">
          {annotation.links.length === 0
            ? "当前节点已经到达叶子层，可以返回上一层或重新搜索。"
            : "当前延伸入口会在 Phase 4 复用 /api/annotate 继续探索。"}
        </div>
      </div>
    </div>
  );
}
