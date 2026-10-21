/** @jest-environment node */
import { connectedRecords, streamEntries } from '@/lib/flow-browser/continuity';
import type { FlowPathRecord } from '@/lib/flow-browser/storage';

const record = (pathId: string, frames: string[], parentPathId: string | null = null, fromFrameId?: string) => ({
  pathId, parentPathId, chain: { chainId: pathId + '-chain', kind: 'remote', frames: frames.map(id => ({ id })) },
  ...(fromFrameId ? { parentEntry: { fromFrameId, anchorId: 'word', label: '知' } } : {}),
}) as FlowPathRecord;

test('projects the connected prefix while preserving original chain ownership', async () => {
  const root = record('root', ['a', 'b', 'c']);
  const child = record('child', ['d', 'e'], 'root', 'b');
  const leaf = record('leaf', ['f', 'g'], 'child', 'd');
  const store = new Map([root, child, leaf].map(item => [item.pathId, item]));
  const records = await connectedRecords(leaf, async id => store.get(id) || null);
  const entries = streamEntries(records);
  expect(entries.map(item => item.frame.id)).toEqual(['a', 'b', 'd', 'f', 'g']);
  expect(entries.map(item => item.chainId)).toEqual(['root-chain', 'root-chain', 'child-chain', 'leaf-chain', 'leaf-chain']);
  expect(root.chain.frames.map((item: { id: string }) => item.id)).toEqual(['a', 'b', 'c']);
});

test('missing history and cycles never hide the current readable passage or loop', async () => {
  const root = record('root', ['a'], 'leaf', 'b');
  const leaf = record('leaf', ['b'], 'root', 'a');
  const load = jest.fn(async (id: string) => id === 'root' ? root : leaf);
  expect((await connectedRecords(leaf, load)).map(item => item.pathId)).toEqual(['root', 'leaf']);
  expect(load).toHaveBeenCalledTimes(1);
  expect(streamEntries(await connectedRecords(leaf, async () => null)).map(item => item.frame.id)).toEqual(['b']);
});
