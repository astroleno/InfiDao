import { FlowError, type FlowFrame } from './contracts';
import type { FlowSessionStore, StoredChain } from './session-store';

export type RecentReading = { source: string; quote: string; reflection: string };
export const MAX_RECENT_READINGS = 3;

// A model's novelty claim cannot permit a near-copy of an earlier reflection.
// Use substantial trigram coverage, so shared topic words and short phrases
// alone do not reject a genuinely different distinction.
export function repeatsRecentReflection(reflection: string, readings: RecentReading[]): boolean {
  const grams = (text: string) => {
    const chars = Array.from(text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, ''));
    return new Set(chars.slice(0, -2).map((char, i) => char + chars[i + 1] + chars[i + 2]));
  };
  const current = grams(reflection);
  if (current.size < 24) return false;
  return retainRecentReadings(readings).some(reading => {
    const previous = grams(reading.reflection);
    const overlap = Array.from(current).filter(gram => previous.has(gram)).length;
    return overlap >= 24 && overlap / current.size >= 0.5;
  });
}

function bounded(text: string, limit: number) {
  const end = /[\uD800-\uDBFF]/u.test(text[limit - 1] || '') ? limit - 1 : limit;
  return text.slice(0, end);
}

export function retainRecentReadings(readings: RecentReading[]): RecentReading[] {
  const unique = new Map<string, RecentReading>();
  for (const reading of readings) {
    if (!reading.quote || !reading.reflection.trim()) continue;
    const kept = { source: bounded(reading.source, 100), quote: bounded(reading.quote, 80),
      reflection: bounded(reading.reflection, 360) };
    const key = JSON.stringify([kept.source, kept.quote, kept.reflection]);
    unique.delete(key); unique.set(key, kept);
  }
  return Array.from(unique.values()).slice(-MAX_RECENT_READINGS);
}

// A branch from an earlier paragraph must not inherit later, unchosen advice.
// New chains already carry the bounded ancestor summaries. Legacy chains walk
// at most three ancestors through the same owner-bound store.
export async function recentReadingsFor(state: StoredChain, owner: string, store: FlowSessionStore,
  through?: Pick<FlowFrame, 'id' | 'ordinal'>): Promise<RecentReading[]> {
  let current: StoredChain | undefined = state, inherited: RecentReading[] = [];
  let cutoff = through;
  const groups: RecentReading[][] = [], visited = new Set<string>();
  for (let depth = 0; current && depth <= MAX_RECENT_READINGS; depth++) {
    if (visited.has(current.chain.chainId)) break;
    visited.add(current.chain.chainId);
    const frames = Object.values(current.nodes).filter(frame => frame.ready &&
      (!cutoff || frame.ordinal <= cutoff.ordinal)).sort((a, b) => a.ordinal - b.ordinal);
    groups.unshift(frames.map(frame => ({ source: frame.source, quote: frame.quote, reflection: frame.reflection })));
    if (current.recentReadings !== undefined) { inherited = current.recentReadings; break; }
    if (groups.flat().filter(reading => reading.reflection.trim()).length >= MAX_RECENT_READINGS || !current.chain.parentChainId) break;
    try {
      const fromFrameId = current.chain.entry?.fromFrameId;
      current = await store.getChain(owner, current.chain.parentChainId);
      cutoff = fromFrameId ? current.nodes[fromFrameId] : undefined;
    }
    catch (error) {
      if (!(error instanceof FlowError) || error.code !== 'CHAIN_EXPIRED') throw error;
      break;
    }
  }
  return retainRecentReadings([...inherited, ...groups.flat()]);
}
