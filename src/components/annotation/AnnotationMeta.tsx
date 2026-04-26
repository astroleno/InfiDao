"use client";

import type { AnnotationResult } from "@/types";

interface Props {
  annotation: AnnotationResult;
}

export function AnnotationMeta({ annotation }: Props) {
  return (
    <div className="flex items-center space-x-3 text-xs text-stone-500">
      <span>段落: {annotation.passageId}</span>
      <span>延伸: {annotation.links.length}</span>
    </div>
  );
}
