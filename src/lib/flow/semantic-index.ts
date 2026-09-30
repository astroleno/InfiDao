import { FLOW_PROMPT_VERSION, type FlowFrame } from './contracts';

export const SEMANTIC_LIMIT = 256;
export const SEMANTIC_TTL_MS = 6 * 60 * 60 * 1000;
export type SemanticEntry = {
  id: string; corpusVersion: string; textHash: string; promptVersion: string;
  text: string; updated: number;
};

// Called only inside the atomic completion of a verified generation. Neither
// the user's seed, the reading focus nor the personal reflection is indexed.
export function retainSemantics(previous: SemanticEntry[], frames: FlowFrame[], now: number): SemanticEntry[] {
  const entries = previous.filter(entry => entry.updated + SEMANTIC_TTL_MS > now && entry.promptVersion === FLOW_PROMPT_VERSION);
  for (const frame of frames) {
    if (!frame.ready || frame.provenance !== 'model') continue;
    const old = entries.findIndex(entry => entry.id === frame.sourceId && entry.corpusVersion === frame.corpusVersion);
    if (old >= 0) entries.splice(old, 1);
    entries.push({ id: frame.sourceId, corpusVersion: frame.corpusVersion, textHash: frame.textHash,
      promptVersion: FLOW_PROMPT_VERSION, updated: now,
      text: [frame.meaning, ...frame.anchors.flatMap(anchor => [anchor.sense, ...anchor.terms])].join(' ').slice(0, 1200) });
  }
  return entries.slice(-SEMANTIC_LIMIT);
}
