import type { PassageRecord } from "@/types";
import { buildTextHash } from "@/lib/data/hash";
import type { InferredSignal } from "@/lib/user-state/types";
import type { InterpretiveFrame, WorkAgentManifest } from "@/lib/work-agents/types";

export const CLASSIC_PASSAGE_FRAMES: InterpretiveFrame[] = [
  {
    id: "liu_jing_zhu_wo",
    label: "六经注我",
    description: "The passage responds to the current user state.",
  },
  {
    id: "wo_zhu_liu_jing",
    label: "我注六经",
    description: "The user state changes how the passage is read.",
  },
  {
    id: "contrast",
    label: "对照",
    description: "The passage creates contrast with the current state.",
  },
  {
    id: "echo",
    label: "回响",
    description: "The passage echoes a nearby feeling or intent.",
  },
  {
    id: "silence",
    label: "留白",
    description: "The passage may withhold an answer and leave a quiet edge.",
  },
];

function affectSignal(label: string, confidence: number): InferredSignal {
  return {
    label,
    confidence,
    source: "passage",
  };
}

function detectAffectField(passage: PassageRecord): InferredSignal[] {
  const text = `${passage.source} ${passage.chapter} ${passage.text}`;
  const signals: InferredSignal[] = [];

  if (/学|习|知|问/u.test(text)) {
    signals.push(affectSignal("learning", 0.72));
  }

  if (/友|信|朋/u.test(text)) {
    signals.push(affectSignal("trust", 0.72));
  }

  if (/孝|父母|家|亲/u.test(text)) {
    signals.push(affectSignal("family_responsibility", 0.7));
  }

  if (/愠|中|和|静|安|止/u.test(text)) {
    signals.push(affectSignal("settling", 0.68));
  }

  if (/省|过|改|诚/u.test(text)) {
    signals.push(affectSignal("self_correction", 0.7));
  }

  if (signals.length === 0) {
    signals.push(affectSignal("classic_resonance", 0.58));
  }

  return signals;
}

export function createClassicPassageWorkAgent(
  passage: PassageRecord,
  options: { expectedTextHash?: string } = {},
): WorkAgentManifest | null {
  if (options.expectedTextHash && options.expectedTextHash !== passage.textHash) {
    return null;
  }

  const textHash = buildTextHash(passage.text);

  if (textHash !== passage.textHash) {
    return null;
  }

  return {
    id: `work:classic:${passage.id}:${passage.textHash.slice(0, 12)}`,
    kind: "classic_passage",
    title: passage.workTitle,
    source: passage.source,
    canonicalRef: `classic:${passage.source}:${passage.chapter}:${passage.section}:${passage.textHash.slice(
      0,
      12,
    )}`,
    contentRef: {
      passageId: passage.id,
      chapter: passage.chapter,
      section: passage.section,
      textHash: passage.textHash,
    },
    affectField: detectAffectField(passage),
    interpretiveFrames: CLASSIC_PASSAGE_FRAMES.map(frame => ({ ...frame })),
    growthPolicy: {
      persist: "ephemeral_only",
      canGrow: true,
      allowedActs: ["encounter", "interpret", "grow", "reflect", "link"],
      maxSummaryLength: 120,
    },
  };
}
