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
      <div className="flex items-center mb-4">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 font-classic">延伸探索</h3>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => (
          <div
            key={`${link.passageId}-${index}`}
            className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md"
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{link.label}</span>
                  </div>

                  <div className="text-sm text-gray-900 font-classic mb-2">{link.passageText}</div>
                  <div className="text-sm text-gray-600 mb-3">
                    {link.source} · {link.chapter} · 第 {link.section} 节
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onNavigate(link)}
                      className="inline-flex items-center text-primary-600 hover:text-primary-800 text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      探索此段落
                    </button>

                    <button
                      onClick={() => setExpandedLink(expandedLink === link.passageId ? null : link.passageId)}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transform transition-transform ${
                          expandedLink === link.passageId ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {expandedLink === link.passageId && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="bg-white rounded-lg p-4 text-sm text-gray-600">
                    这个入口已经带上下一跳所需的段落信息；Phase 4 会直接复用它再次调用 `/api/annotate`。
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
