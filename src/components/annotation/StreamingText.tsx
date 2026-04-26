type AnnotationTab = "sixToMe" | "meToSix";

interface StreamingTextProps {
  isLoading: boolean;
  activeTab: AnnotationTab;
  onTabChange: (tab: AnnotationTab) => void;
}

const SECTIONS: Record<AnnotationTab, { title: string; description: string }> = {
  sixToMe: {
    title: "六经注我",
    description: "经典正在整理回应，稍后会逐字展开。",
  },
  meToSix: {
    title: "我注六经",
    description: "你的提问正在与原文重新对照。",
  },
};

export function StreamingText({ isLoading, activeTab, onTabChange }: StreamingTextProps) {
  return (
    <div className="streaming-text-container">
      <div className="min-h-[220px] rounded-lg border border-stone-800 bg-stone-900/70 p-6">
        <div role="tablist" aria-label="生成中的注释视角" className="mb-4 flex space-x-2">
          {(Object.keys(SECTIONS) as AnnotationTab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onTabChange(tab)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeTab === tab ? "bg-zen text-ink" : "bg-stone-950 text-stone-400 hover:text-paper"
              }`}
            >
              {SECTIONS[tab].title}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-stone-800"></div>
            <div className="h-4 w-full animate-pulse rounded bg-stone-800"></div>
            <div className="h-4 w-5/6 animate-pulse rounded bg-stone-800"></div>
            <div className="h-4 w-2/3 animate-pulse rounded bg-stone-800"></div>
          </div>

          <div className="rounded-xl border border-stone-800 bg-stone-950/70 p-4 text-sm text-stone-300">
            {SECTIONS[activeTab].description}
          </div>

          {isLoading && (
            <div className="flex items-center text-sm text-stone-400">
              <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-zen"></span>
              正在整理这一念与原文的对应关系。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
