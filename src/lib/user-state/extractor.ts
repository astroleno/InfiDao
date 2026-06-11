import crypto from "node:crypto";
import type {
  InferredSignal,
  InferredSignalSource,
  MemoryAnchor,
  UserStatePrivacyMode,
  UserStateSnapshot,
} from "@/lib/user-state/types";

const DEFAULT_SESSION_ID = "session:ephemeral";

interface SignalRule {
  label: string;
  confidence: number;
  source: InferredSignalSource;
  pattern: RegExp;
}

export interface UserStateExtractionInput {
  utterance: string;
  sessionId?: string;
  contextText?: string;
  privacyMode?: UserStatePrivacyMode;
  createdAt?: string;
}

const EMOTION_RULES: SignalRule[] = [
  {
    label: "pressure",
    confidence: 0.78,
    source: "query",
    pattern: /压力|焦虑|不安|烦躁|心乱|疲惫|stress|anxious|overwhelmed|pressure/i,
  },
  {
    label: "uncertainty",
    confidence: 0.72,
    source: "query",
    pattern: /迷茫|困惑|不知道|犹豫|不确定|uncertain|confused|lost/i,
  },
  {
    label: "nostalgia",
    confidence: 0.72,
    source: "query",
    pattern: /想起|记得|怀念|故乡|从前|remember|miss|nostalgia/i,
  },
  {
    label: "settling",
    confidence: 0.66,
    source: "query",
    pattern: /安住|安顿|收心|平静|定下来|calm|settle/i,
  },
];

const INTENT_RULES: SignalRule[] = [
  {
    label: "seek_guidance",
    confidence: 0.82,
    source: "query",
    pattern: /怎么办|如何|怎么|要不要|该不该|help|guide|what should/i,
  },
  {
    label: "interpret",
    confidence: 0.76,
    source: "query",
    pattern: /什么意思|如何理解|解释|读懂|interpret|meaning|understand/i,
  },
  {
    label: "remember",
    confidence: 0.74,
    source: "query",
    pattern: /想起|记得|怀念|回忆|remember|memory|miss/i,
  },
  {
    label: "compare",
    confidence: 0.7,
    source: "query",
    pattern: /比较|对比|区别|像不像|compare|versus|difference/i,
  },
  {
    label: "continue_exploration",
    confidence: 0.68,
    source: "query",
    pattern: /继续|下一句|延伸|再看|explore|continue|next/i,
  },
];

const PERSONA_RULES: SignalRule[] = [
  {
    label: "reflective",
    confidence: 0.68,
    source: "query",
    pattern: /自省|反思|修正|改过|reflect|introspect/i,
  },
  {
    label: "relational",
    confidence: 0.66,
    source: "query",
    pattern: /朋友|父母|家庭|关系|同事|friend|family|relationship/i,
  },
  {
    label: "learning_oriented",
    confidence: 0.64,
    source: "query",
    pattern: /学习|实践|练习|成长|learn|practice|growth/i,
  },
];

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function detectSignals(rules: SignalRule[], text: string): InferredSignal[] {
  const found = new Map<string, InferredSignal>();

  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const existing = found.get(rule.label);
    const next: InferredSignal = {
      label: rule.label,
      confidence: clampConfidence(rule.confidence),
      source: rule.source,
    };

    if (!existing || existing.confidence < next.confidence) {
      found.set(rule.label, next);
    }
  }

  return [...found.values()].sort((left, right) => right.confidence - left.confidence);
}

function extractMemoryAnchors(text: string): MemoryAnchor[] {
  if (!/想起|记得|怀念|回忆|从前|故乡|remember|memory|miss/i.test(text)) {
    return [];
  }

  const anchors: MemoryAnchor[] = [];
  const addAnchor = (label: string, confidence: number) => {
    if (!anchors.some(anchor => anchor.label === label)) {
      anchors.push({
        label,
        confidence: clampConfidence(confidence),
        source: "query",
      });
    }
  };

  if (/父母|家|家庭|family|mother|father/i.test(text)) {
    addAnchor("family", 0.74);
  }

  if (/朋友|同学|friend|classmate/i.test(text)) {
    addAnchor("friendship", 0.72);
  }

  if (/故乡|家乡|城市|hometown|city/i.test(text)) {
    addAnchor("hometown", 0.7);
  }

  if (/学校|课堂|老师|school|teacher/i.test(text)) {
    addAnchor("school", 0.68);
  }

  if (anchors.length === 0) {
    addAnchor("past_experience", 0.62);
  }

  return anchors;
}

export function extractUserStateSnapshot(input: UserStateExtractionInput): UserStateSnapshot {
  const utterance = normalizeText(input.utterance);
  const contextText = normalizeText(input.contextText ?? "");
  const combinedText = `${utterance} ${contextText}`.trim();
  const sessionId = normalizeText(input.sessionId ?? DEFAULT_SESSION_ID) || DEFAULT_SESSION_ID;
  const privacyMode = input.privacyMode ?? "ephemeral";
  const createdAt = input.createdAt ?? new Date().toISOString();
  const id = `user-state:${stableHash({
    sessionId,
    utterance,
    privacyMode,
    createdAt,
  }).slice(0, 18)}`;

  return {
    id,
    sessionId,
    utterance,
    emotion: detectSignals(EMOTION_RULES, combinedText),
    intent: detectSignals(INTENT_RULES, combinedText),
    memoryAnchors: extractMemoryAnchors(combinedText),
    personaHints: detectSignals(PERSONA_RULES, combinedText),
    privacyMode,
    createdAt,
  };
}
