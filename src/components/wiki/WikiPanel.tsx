import type { WikiStack } from "@/lib/wiki/service";

interface WikiPanelProps {
  stack: WikiStack;
  onBack: () => void;
  placement?: "desktop" | "mobile";
}

export function WikiPanel({ stack, onBack, placement = "desktop" }: WikiPanelProps) {
  if (stack.length === 0 || (placement === "mobile" && stack.length <= 1)) {
    return null;
  }

  const currentNode = stack[stack.length - 1];
  const currentPathLabel = currentNode?.via
    ? `由此进入：${currentNode.via.source} ${currentNode.via.chapter}`
    : "从选中经文入卷";

  return (
    <section className="border-b border-stone-800 bg-stone-950/60 p-4 text-stone-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.28em] text-stone-500">回响路径</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm tracking-[0.14em] text-zen">{currentPathLabel}</span>
          </div>
        </div>

        {stack.length > 1 && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center rounded-full border border-stone-700 px-4 py-2 text-xs tracking-[0.18em] text-stone-300 transition hover:border-zen hover:text-paper active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink md:min-h-0 md:px-3 md:py-1.5"
          >
            返回上一层
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {stack.map((node, index) => (
          <div
            key={`${node.depth}-${node.id}`}
            className={`rounded-full border px-3 py-1 text-xs ${
              node.depth === stack.length - 1
                ? "border-zen/70 bg-zen/10 text-zen"
                : "border-stone-800 text-stone-500"
            }`}
          >
            {index === 0 ? "起句" : node.via?.label ?? "再入"}
          </div>
        ))}
      </div>
    </section>
  );
}
