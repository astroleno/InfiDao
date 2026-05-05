import type { AnnotationLink } from "@/types";

interface AnnotationLinksProps {
  links: AnnotationLink[];
  onNavigate: (link: AnnotationLink) => void;
}

export function AnnotationLinks({ links, onNavigate }: AnnotationLinksProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="annotation-links">
      <div className="mb-4 flex items-center">
        <svg className="mr-2 h-5 w-5 text-zen" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-lg font-semibold text-paper font-classic">下一句</h3>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => {
          const sourceLabel = `${link.source} · ${link.chapter} · 第 ${link.section} 节`;

          return (
            <button
              key={`${link.passageId}-${index}`}
              type="button"
              onClick={() => onNavigate(link)}
              aria-label={`进入下一句：《${link.source}·${link.chapter}》第 ${link.section} 节`}
              className="flex min-h-11 w-full items-center gap-3 border-y border-stone-800 bg-stone-950/35 px-4 py-3 text-left transition hover:border-zen/50 hover:bg-stone-900/55 active:-translate-y-px focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
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
          );
        })}
      </div>
    </div>
  );
}
