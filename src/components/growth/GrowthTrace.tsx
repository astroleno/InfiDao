import type { AnnotationAgentTrace } from "@/types";

interface GrowthTraceProps {
  trace?: AnnotationAgentTrace | undefined;
  compact?: boolean;
}

export function GrowthTrace({ trace, compact = false }: GrowthTraceProps) {
  const containerClassName = compact
    ? "border-l border-stone-800/70 py-3 pl-4 pr-2"
    : "border-l border-seal/45 py-4 pl-4 pr-2";

  if (!trace) {
    return (
      <section aria-label="关系枝条" className={containerClassName}>
        <div className="text-[11px] tracking-[0.22em] text-stone-500">关系枝条</div>
        <p className="mt-2 text-sm leading-6 text-stone-500">此处暂未生枝。</p>
      </section>
    );
  }

  return (
    <section aria-label="关系枝条" className={containerClassName}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] tracking-[0.22em] text-seal">关系枝条</div>
        <div className="max-w-32 truncate text-right text-[11px] tracking-[0.14em] text-zen/80">
          {trace.relationTheme}
        </div>
      </div>
      <p className="mt-2 text-base leading-7 text-paper font-classic">{trace.branchLabel}</p>
      <p className="mt-2 text-sm leading-7 text-stone-300">{trace.growthSummary}</p>
    </section>
  );
}
