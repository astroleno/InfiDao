import type {
  AnnotateRequest,
  AnnotationLink,
  AnnotationResult,
  AnnotationStyle,
  PassageRecord,
} from "@/types";
import {
  AnnotationLlmTimeoutError,
  generateAnnotationFromLlm,
  resolveAnnotationLlmMode,
  resolveAnnotationLlmRequestPlan,
} from "@/lib/annotation/llm";
import {
  buildAnnotationCacheKey,
  getCachedAnnotation,
  setCachedAnnotation,
} from "@/lib/annotation/cache";
import {
  recordAnnotationTelemetry,
  type AnnotationFallbackReason,
} from "@/lib/annotation/telemetry";
import { loadSearchIndex } from "@/lib/search/index-store";
import { rankLexicalCandidates } from "@/lib/search/lexical";

const STYLE_OPENERS: Record<AnnotationStyle, string> = {
  academic: "从义理结构看",
  classical: "以古意观之",
  modern: "放到当下处境看",
  poetic: "若作一束回光看",
};

function compactText(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function formatPassageLabel(passage: PassageRecord): string {
  return `${passage.source} ${passage.chapter} 第 ${passage.section} 节`;
}

function buildFallbackAnnotationCopy(
  query: string,
  passageText: string,
  style: AnnotationStyle,
  sourceLabel: string,
): Pick<AnnotationResult, "sixToMe" | "meToSix"> {
  const opener = STYLE_OPENERS[style];

  return {
    sixToMe: `${opener}，${sourceLabel} 以「${passageText}」回应“${query}”。这句话先把注意力拉回具体行动：看见关系中的责任、分寸与可修之处，再决定下一步怎么做。`,
    meToSix: `从“${query}”反观这段经典，你不是在寻找一句结论，而是在给「${compactText(passageText, 32)}」补上一种当代处境。你的问题让原文从训诫变成可实践的自我校准。`,
  };
}

function buildLinks(
  corpus: PassageRecord[],
  query: string,
  passageId: string,
  passageText: string,
): AnnotationLink[] {
  const candidates = rankLexicalCandidates(corpus, `${query} ${passageText}`, 8)
    .filter(candidate => candidate.id !== passageId)
    .slice(0, 3);

  return candidates.map(candidate => ({
    passageId: candidate.id,
    label: `延伸：${formatPassageLabel(candidate)}`,
    passageText: candidate.text,
    source: candidate.source,
    chapter: candidate.chapter,
    section: candidate.section,
  }));
}

export async function createAnnotation({
  query,
  passageId,
  passageText,
  style = "modern",
}: AnnotateRequest): Promise<AnnotationResult> {
  const startedAt = Date.now();
  const index = await loadSearchIndex();
  const sourcePassage = index.corpus.find(passage => passage.id === passageId);
  const sourceLabel = sourcePassage ? formatPassageLabel(sourcePassage) : "所选段落";
  const trimmedQuery = query.trim();
  const trimmedPassageText = passageText.trim();
  const mode = resolveAnnotationLlmMode();
  const cacheKey = buildAnnotationCacheKey({
    query: trimmedQuery,
    passageId,
    passageText: trimmedPassageText,
    style,
    mode,
  });
  const cachedAnnotation = getCachedAnnotation(cacheKey);

  if (cachedAnnotation) {
    recordAnnotationTelemetry({
      mode,
      provider: "cache",
      elapsedMs: Date.now() - startedAt,
      cacheHit: true,
      fallbackHit: false,
    });

    return cachedAnnotation;
  }

  const fallbackCopy = buildFallbackAnnotationCopy(
    trimmedQuery,
    trimmedPassageText,
    style,
    sourceLabel,
  );
  const requestPlan = resolveAnnotationLlmRequestPlan(mode);

  let annotationCopy = fallbackCopy;
  let cacheable = requestPlan.length === 0;
  let provider: "deterministic" | "llm" = "deterministic";
  let providerModel: string | undefined;
  let providerSlot: "primary" | "secondary" | undefined;
  let fallbackHit = true;
  let fallbackReason: AnnotationFallbackReason | undefined =
    requestPlan.length === 0 ? "not_configured" : undefined;

  try {
    const llmAnnotation = await generateAnnotationFromLlm(
      {
        query: trimmedQuery,
        passageLabel: sourceLabel,
        passageText: trimmedPassageText,
        style,
      },
      mode,
    );

    if (llmAnnotation) {
      annotationCopy = {
        sixToMe: llmAnnotation.sixToMe,
        meToSix: llmAnnotation.meToSix,
      };
      cacheable = true;
      provider = "llm";
      providerModel = llmAnnotation.model;
      providerSlot = llmAnnotation.slot;
      fallbackHit = requestPlan[0]?.slot !== llmAnnotation.slot;
      fallbackReason = fallbackHit ? "slot_failover" : undefined;
    }
  } catch (error) {
    annotationCopy = fallbackCopy;
    cacheable = false;
    fallbackHit = true;
    fallbackReason = error instanceof AnnotationLlmTimeoutError ? "timeout" : "provider_error";
  }

  const annotation = {
    passageId,
    passageText: trimmedPassageText,
    sixToMe: annotationCopy.sixToMe,
    meToSix: annotationCopy.meToSix,
    links: buildLinks(index.corpus, trimmedQuery, passageId, trimmedPassageText),
  };

  if (cacheable) {
    setCachedAnnotation(cacheKey, annotation);
  }

  recordAnnotationTelemetry({
    mode,
    provider,
    elapsedMs: Date.now() - startedAt,
    cacheHit: false,
    fallbackHit,
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
    ...(providerModel !== undefined ? { model: providerModel } : {}),
    ...(providerSlot !== undefined ? { slot: providerSlot } : {}),
  });

  return annotation;
}
