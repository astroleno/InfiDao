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

interface FallbackTheme {
  signals: RegExp;
  center: string;
  action: string;
  reframe: string;
}

const DEFAULT_FALLBACK_THEME: FallbackTheme = {
  signals: /困境|挫折|逆境|艰难|压力/u,
  center: "困境中仍能修正自己的能力",
  action: "稳住基本原则，持续学习，发现偏差时立刻调整，不让压力把自己推向虚浮",
  reframe: "经典从品德训诫变成了逆境中的行动框架",
};

const FALLBACK_THEMES: FallbackTheme[] = [
  {
    signals: /焦虑|安定|安心|不安|烦躁|心乱|情绪|喜怒哀乐|中和|不愠/u,
    center: "情绪未发时的清明",
    action: "先让念头停一拍，再决定如何表达与行动，不把一时的波动误认为全部的自己",
    reframe: "经典不再只是讲中庸之理，而像一套情绪调节的方法",
  },
  {
    signals: /误解|误会|不理解|不知|不愠/u,
    center: "不被外界评价牵走的定力",
    action: "把力气收回到持续学习、修正行为和守住本心上，不急着用辩白证明自己",
    reframe: "经典从修身训诫变成了处理误解时的心理边界",
  },
  {
    signals: /家庭|责任|父母|孝|弟|悌|家/u,
    center: "身边关系里的具体责任",
    action: "先把家庭中的分寸、承诺与照料做实，再谈更远处的担当",
    reframe: "经典从家族伦理变成了现代生活里的责任排序",
  },
  {
    signals: /友谊|朋友|友|交|信/u,
    center: "言行一致的信任",
    action: "少消耗在热闹关系里，把承诺、真诚和可托付放在友谊的中心",
    reframe: "经典从交友原则变成了筛选高质量关系的方法",
  },
  {
    signals: /学习|实践|时习|学|习/u,
    center: "把所学放回行动",
    action: "通过反复练习和真实反馈，让知识从理解变成可用的习惯",
    reframe: "经典从读书劝勉变成了学习闭环",
  },
  {
    signals: /自省|修身|改过|迁善|三省|过|改|善/u,
    center: "敢于修正自己的勇气",
    action: "把错误当成反馈，尽快回到忠信、反省和改过的行动上",
    reframe: "经典从道德要求变成了自我迭代的方法",
  },
  {
    signals: /中庸|平衡|中和|时中|过犹不及/u,
    center: "不过度也不失守的动态平衡",
    action: "先辨清局势的分寸，再在原则和弹性之间找到可持续的位置",
    reframe: "经典从折中之说变成了复杂处境中的决策能力",
  },
  DEFAULT_FALLBACK_THEME,
];

function compactText(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function formatPassageLabel(passage: PassageRecord): string {
  return `${passage.source} ${passage.chapter} 第 ${passage.section} 节`;
}

function selectFallbackTheme(query: string, passageText: string): FallbackTheme {
  const queryTheme = FALLBACK_THEMES.find(candidate => candidate.signals.test(query));

  if (queryTheme) {
    return queryTheme;
  }

  return (
    FALLBACK_THEMES.find(candidate => candidate.signals.test(`${query} ${passageText}`)) ??
    DEFAULT_FALLBACK_THEME
  );
}

function buildFallbackAnnotationCopy(
  query: string,
  passageText: string,
  style: AnnotationStyle,
  sourceLabel: string,
): Pick<AnnotationResult, "sixToMe" | "meToSix"> {
  const opener = STYLE_OPENERS[style];
  const theme = selectFallbackTheme(query, passageText);
  const quotedPassage = compactText(passageText, 42);

  return {
    sixToMe: `${opener}，${sourceLabel} 把“${query}”拉回${theme.center}。原文「${quotedPassage}」提醒你：${theme.action}。`,
    meToSix: `从“${query}”反观这段经典，${theme.reframe}。你不是在寻找一句固定结论，而是在让「${compactText(passageText, 30)}」进入当下处境，成为下一步行动的校准。`,
  };
}

function buildLinks(
  corpus: PassageRecord[],
  query: string,
  passageId: string,
  passageText: string,
  visitedPassageIds: string[],
): AnnotationLink[] {
  const excludedPassageIds = new Set([...visitedPassageIds, passageId]);
  const candidateLimit = Math.min(corpus.length, Math.max(12, excludedPassageIds.size + 6));
  const candidates = rankLexicalCandidates(corpus, `${query} ${passageText}`, candidateLimit)
    .filter(candidate => !excludedPassageIds.has(candidate.id))
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

function normalizeVisitedPassageIds(passageId: string, visitedPassageIds: string[] = []): string[] {
  const normalizedIds = new Set<string>();

  for (const id of [...visitedPassageIds, passageId]) {
    const normalizedId = id.trim();

    if (normalizedId) {
      normalizedIds.add(normalizedId);
    }
  }

  return [...normalizedIds].sort((left, right) => {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  });
}

export async function createAnnotation({
  query,
  passageId,
  passageText,
  style = "modern",
  visitedPassageIds = [],
}: AnnotateRequest): Promise<AnnotationResult> {
  const startedAt = Date.now();
  const index = await loadSearchIndex();
  const sourcePassage = index.corpus.find(passage => passage.id === passageId);
  const sourceLabel = sourcePassage ? formatPassageLabel(sourcePassage) : "所选段落";
  const trimmedQuery = query.trim();
  const trimmedPassageText = passageText.trim();
  const normalizedVisitedPassageIds = normalizeVisitedPassageIds(passageId, visitedPassageIds);
  const mode = resolveAnnotationLlmMode();
  const cacheKey = buildAnnotationCacheKey({
    query: trimmedQuery,
    passageId,
    passageText: trimmedPassageText,
    style,
    mode,
    visitedPassageIds: normalizedVisitedPassageIds,
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
    links: buildLinks(
      index.corpus,
      trimmedQuery,
      passageId,
      trimmedPassageText,
      normalizedVisitedPassageIds,
    ),
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
