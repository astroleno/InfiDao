/** @jest-environment node */
import { reviewRelations } from '@/lib/flow/relations';
import { flowJson } from '@/lib/flow/model';
import type { FlowFrame } from '@/lib/flow/contracts';
jest.mock('@/lib/flow/model', () => ({ flowJson: jest.fn() }));
const frame: FlowFrame = { id: 'f', ordinal: 1, sourceId: 'source', quote: '物有本末，事有终始。',
  corpusVersion: 'v1', textHash: 'hash', quoteStart: 0, quoteEnd: 12, source: '大学', chapterLabel: '经一章',
  fullText: '物有本末，事有终始。', meaning: '事物有根本与末节。', reflection: '试着分清先后。',
  reflectionSpans: [{ text: '试着分清' }, { text: '先后', anchorId: 'a' }, { text: '。' }],
  anchors: [{ id: 'a', label: '先后', sense: '事情的次序', direction: '次序与开始', terms: ['先后'],
    target: { sourceId: 'other', quote: '知所先后，则近道矣。', meaning: '辨明次序。' } }], provenance: 'model', ready: true };

test('review cannot introduce targets or change a verified quotation', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以从先后辨别轻重。', anchorIds: ['a', 'invented'] }] });
  const result = await reviewRelations([frame], '', '本末', [], new AbortController().signal);
  expect(result[0]!.quote).toBe(frame.quote);
  expect(result[0]!.anchors).toEqual(frame.anchors);
  expect(result[0]!.reflectionSpans.map(span => span.text).join('')).toBe(result[0]!.reflection);
});
test('unrelated nodes and ungrounded links disappear instead of being made clickable', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: false, reflection: '未找到合适联系。', anchorIds: [] }] });
  expect(await reviewRelations([frame], '', '本末', [], new AbortController().signal)).toEqual([]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以辨别轻重。', anchorIds: ['a'] }] });
  const result = await reviewRelations([frame], '', '本末', [], new AbortController().signal);
  expect(result[0]!.anchors).toEqual([]);
  expect(result[0]!.reflectionSpans).toEqual([{ text: '可以辨别轻重。' }]);
});
