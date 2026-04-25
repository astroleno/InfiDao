type AnnotationTab = "sixToMe" | "meToSix";

interface StreamingTextProps {
  isLoading: boolean;
  activeTab: AnnotationTab;
  onTabChange: (tab: AnnotationTab) => void;
}

const SECTIONS: Record<AnnotationTab, { title: string; description: string }> = {
  sixToMe: {
    title: "六经注我",
    description: "搜索结果稳定后，这里会用完成态 JSON 做前端准流式展示。",
  },
  meToSix: {
    title: "我注六经",
    description: "注释接口不会再暴露 SSE；逐字出现只由客户端展示层负责。",
  },
};

export function StreamingText({ isLoading, activeTab, onTabChange }: StreamingTextProps) {
  return (
    <div className="streaming-text-container">
      <div className="bg-white border border-gray-200 rounded-lg p-6 min-h-[220px]">
        <div className="flex space-x-2 mb-4">
          {(Object.keys(SECTIONS) as AnnotationTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeTab === tab ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {SECTIONS[tab].title}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse"></div>
            <div className="h-4 w-full rounded bg-gray-200 animate-pulse"></div>
            <div className="h-4 w-5/6 rounded bg-gray-200 animate-pulse"></div>
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse"></div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {SECTIONS[activeTab].description}
          </div>

          {isLoading && (
            <div className="flex items-center text-sm text-gray-500">
              <span className="mr-2 h-2 w-2 rounded-full bg-primary-500 animate-pulse"></span>
              正在准备完成态 JSON，随后交给客户端做逐字出现。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
