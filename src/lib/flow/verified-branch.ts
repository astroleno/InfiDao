import { createHash } from 'node:crypto';
import type { ContentScope } from '@/lib/content/contracts';
import type { FlowFrame } from './contracts';
import type { RecentReading } from './reading-history';

export type VerifiedBranchDraft = {
  signature: string;
  version: string;
  plan: { sense: string; direction: string; terms: string[] };
};
export type VerifiedBranch = VerifiedBranchDraft & {
  target: Pick<FlowFrame, 'sourceId' | 'corpusVersion' | 'textHash' | 'quoteStart' | 'quoteEnd' | 'quote'>;
  updated: number;
};

export function verifiedBranchSignature(input: {
  frame: FlowFrame; word: { start: number; end: number; label: string };
  scope: ContentScope; version: string; focus: string; seed: string; graph: boolean;
  priorQuotes: string[]; recentReadings: RecentReading[];
}) {
  const { frame, word, scope, version, focus, seed, graph, priorQuotes, recentReadings } = input;
  return createHash('sha256').update(JSON.stringify([
    version, scope.fingerprint, graph, focus, seed, priorQuotes, recentReadings,
    frame.sourceId, frame.source, frame.chapterLabel, frame.work ?? null, frame.corpusVersion, frame.textHash,
    frame.quoteStart, frame.quoteEnd, frame.quote, word.start, word.end, word.label,
  ])).digest('hex');
}
