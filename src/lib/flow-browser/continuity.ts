import type { FlowFrame } from '../flow/contracts';
import type { FlowPathRecord } from './storage';

export type StreamEntry = {
  pathId: string;
  chainId: string;
  kind: 'curated' | 'remote';
  frame: FlowFrame;
};

/** A local reading path, never a synthetic server chain or cursor. */
export async function connectedRecords(
  leaf: FlowPathRecord,
  load: (pathId: string) => Promise<FlowPathRecord | null>,
): Promise<FlowPathRecord[]> {
  const records = [leaf];
  const seen = new Set([leaf.pathId]);
  let child = leaf;
  while (child.parentPathId && !seen.has(child.parentPathId)) {
    const parent = await load(child.parentPathId);
    if (!parent) break;
    seen.add(parent.pathId);
    records.unshift(parent);
    child = parent;
  }
  return records;
}

export function streamEntries(records: FlowPathRecord[]): StreamEntry[] {
  const entries: StreamEntry[] = [];
  const seen = new Set<string>();
  records.forEach((record, index) => {
    const frames = record.chain.frames as FlowFrame[];
    const next = records[index + 1];
    const boundary = next?.parentEntry?.fromFrameId;
    const stop = boundary ? frames.findIndex(frame => frame.id === boundary) : -1;
    const visible = stop < 0 ? frames : frames.slice(0, stop + 1);
    for (const frame of visible) {
      const key = `${record.pathId}:${frame.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ pathId: record.pathId, chainId: record.chain.chainId,
        kind: record.chain.kind === 'curated' ? 'curated' : 'remote', frame });
    }
  });
  return entries;
}

export function entryKey(entry: StreamEntry) {
  return `${entry.pathId}:${entry.frame.id}`;
}
