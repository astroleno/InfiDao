"use client";
import React from 'react';

interface Props {
  annotation: {
    score?: number;
    reason?: string;
    links?: Array<{ to_passage?: string; to_id?: string; score?: number }>
  };
}

export function AnnotationMeta({ annotation }: Props) {
  const reason = annotation.reason || 'semantic';
  const score = annotation.score ?? 0;
  const links = Array.isArray(annotation.links) ? annotation.links.length : 0;

  return (
    <div className="flex items-center text-xs text-gray-500 space-x-3">
      <span>关系: {reason}</span>
      <span>匹配: {Math.round(score * 100)}%</span>
      <span>延伸: {links}</span>
    </div>
  );
}


