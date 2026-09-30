/** @jest-environment node */
import { flowCorpus } from '@/lib/flow/candidates';
import { createCuratedFlowProvider } from '@/lib/flow-browser/provider';
const { passages, version } = require('../../shared/flow/curated-data');

test('all curated identities and UTF-16 quote ranges match the server corpus', async () => {
  const corpus = new Map((await flowCorpus()).map(row => [row.id, row]));
  expect(Object.keys(passages)).toHaveLength(16);
  for (const frame of Object.values(passages) as any[]) {
    const row = corpus.get(frame.sourceId)!;
    expect(row).toBeDefined();
    expect(frame.corpusVersion).toBe(row.corpusVersion); expect(frame.textHash).toBe(row.textHash);
    expect(row.text.slice(frame.quoteStart, frame.quoteEnd)).toBe(frame.quote);
    expect(frame.fullText).toBe(row.text);
  }
});
test('curated refresh restores the same branch and continuation without network calls', async () => {
  const first = createCuratedFlowProvider(), root = await first.open('');
  expect(root.version).toBe(version); expect(root.kind).toBe('curated');
  const second = createCuratedFlowProvider(); second.restore(root);
  const frame = root.frames[0]!;
  const child = await second.branch({ chainId: root.chainId, fromFrameId: frame.id, anchorId: frame.anchors[0]!.id });
  expect(child.entry?.fromFrameId).toBe(frame.id); expect(child.parentChainId).toBe(root.chainId);
  const third = createCuratedFlowProvider(); third.restore(child);
  expect((await third.next({ chainId: child.chainId, cursor: child.cursor! })).frames[0]!.ordinal).toBe(4);
});
