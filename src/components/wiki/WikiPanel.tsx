import type { WikiStack } from "@/lib/wiki/service";

interface WikiPanelProps {
  stack: WikiStack;
  onBack: () => void;
  placement?: "desktop" | "mobile";
}

export function WikiPanel({ stack, onBack, placement = "desktop" }: WikiPanelProps) {
  if (stack.length === 0 || placement === "mobile") {
    return null;
  }

  const currentNode = stack[stack.length - 1];
  const currentPathLabel = currentNode?.via
    ? `由此进入：${currentNode.via.source} ${currentNode.via.chapter}`
    : "从选中经文入卷";

  return (
    <section className="mb-4 bg-transparent text-stone-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 border-l border-seal/45 pl-3">
          <p className="text-[11px] tracking-[0.24em] text-stone-500">当前层级</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="truncate text-sm tracking-[0.1em] text-zen/90">{currentPathLabel}</span>
          </div>
        </div>

        {stack.length > 1 && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center border-b border-stone-700 px-1 py-2 text-xs tracking-[0.18em] text-stone-300 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink md:min-h-0 md:py-1.5"
          >
            返回上一层
          </button>
        )}
      </div>

      {stack.length > 1 && (
        <details className="mt-3">
          <summary className="min-h-8 cursor-pointer list-none text-xs tracking-[0.16em] text-stone-500 transition hover:text-stone-300 focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink [&::-webkit-details-marker]:hidden">
            展开卷路
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {stack.map((node, index) => (
              <span
                key={`${node.depth}-${node.id}`}
                className={`border-b px-1.5 py-1 text-xs ${
                  node.depth === stack.length - 1
                    ? "border-zen/70 text-zen"
                    : "border-stone-800 text-stone-500"
                }`}
              >
                {index === 0 ? "起句" : node.via?.label ?? "再入"}
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
