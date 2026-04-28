import type { AnnotationLink, AnnotationResult } from "@/types";

export interface WikiNode {
  id: string;
  depth: number;
  query: string;
  annotation: AnnotationResult;
  via?: AnnotationLink;
}

export type WikiStack = WikiNode[];

interface PushWikiNodeOptions {
  query: string;
  annotation: AnnotationResult;
  via?: AnnotationLink;
}

function buildWikiNode({ query, annotation, via }: PushWikiNodeOptions, depth: number): WikiNode {
  return {
    id: annotation.passageId,
    depth,
    query,
    annotation,
    ...(via !== undefined ? { via } : {}),
  };
}

export function createWikiRoot(query: string, annotation: AnnotationResult): WikiStack {
  return [buildWikiNode({ query, annotation }, 0)];
}

export function pushWikiNode(stack: WikiStack, options: PushWikiNodeOptions): WikiStack {
  return [...stack, buildWikiNode(options, stack.length)];
}

export function popWikiStack(stack: WikiStack): WikiStack {
  if (stack.length <= 1) {
    return stack;
  }

  return stack.slice(0, -1);
}

export function currentWikiNode(stack: WikiStack): WikiNode | null {
  return stack.at(-1) ?? null;
}

export function resetWikiStack(): WikiStack {
  return [];
}
