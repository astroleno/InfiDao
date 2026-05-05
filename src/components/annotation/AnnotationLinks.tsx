import { useState } from "react";
import type { AnnotationLink } from "@/types";

interface AnnotationLinksProps {
  links: AnnotationLink[];
  onNavigate: (link: AnnotationLink) => void;
}

export function AnnotationLinks({ links, onNavigate }: AnnotationLinksProps) {
  const [expandedLink, setExpandedLink] = useState<string | null>(null);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="annotation-links">
      <div className="mb-4 flex items-center">
        <svg className="mr-2 h-5 w-5 text-zen" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-lg font-semibold text-paper font-classic">由此进入</h3>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => {
          const isExpanded = expandedLink === link.passageId;
          const detailId = `annotation-link-${link.passageId}-${index}-detail`;
          const sourceLabel = `${link.source} · ${link.chapter} · 第 ${link.section} 节`;

          return (
            <div
              key={`${link.passageId}-${index}`}
              className="overflow-hidden border-y border-stone-800 bg-stone-950/35 transition-all duration-200 hover:border-zen/50"
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => onNavigate(link)}
                  aria-label={`沿此句继续：《${link.source}·${link.chapter}》第 ${link.section} 节`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-900/55 active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center border border-seal/50 text-seal">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-stone-200">{link.label}</span>
                    <span className="mt-1 block truncate text-sm text-paper font-classic">{link.passageText}</span>
                    <span className="mt-1 block text-xs tracking-[0.12em] text-stone-500">{sourceLabel}</span>
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={`${isExpanded ? "收起" : "展开"}延伸详情：${link.label}`}
                  aria-expanded={isExpanded}
                  aria-controls={detailId}
                  onClick={() => setExpandedLink(isExpanded ? null : link.passageId)}
                  className="flex min-h-11 min-w-11 items-center justify-center border-l border-stone-800 px-3 text-stone-400 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
                >
                  <svg
                    className={`h-4 w-4 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {isExpanded && (
                <div id={detailId} className="border-t border-stone-800 px-4 py-3">
                  <div className="border-l border-seal/50 bg-stone-950/55 p-4 text-sm leading-6 text-stone-400">
                    沿此句继续，进入下一层回响。
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
