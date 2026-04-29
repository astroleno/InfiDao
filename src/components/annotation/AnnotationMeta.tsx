"use client";

import type { AnnotationResult } from "@/types";

interface Props {
  annotation: AnnotationResult;
  targetLabel?: string | null | undefined;
}

export function AnnotationMeta({ annotation, targetLabel }: Props) {
  return (
    <div className="flex flex-col items-end gap-1 text-right text-xs text-stone-500 sm:flex-row sm:items-center sm:gap-3">
      <span>{targetLabel ?? "当前经文"}</span>
      <span>{annotation.links.length > 0 ? "可继续互注" : "此处暂止"}</span>
    </div>
  );
}
