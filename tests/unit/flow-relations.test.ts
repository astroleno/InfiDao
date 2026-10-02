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
  expect(result[0]!.anchors).toEqual([{ ...frame.anchors[0], surface: 'reflection', start: 3, end: 5 }]);
  expect(result[0]!.reflectionSpans.map(span => span.text).join('')).toBe(result[0]!.reflection);
});
test('review preserves valid original and meaning links even when their labels are absent from reflection', async () => {
  const expanded: FlowFrame = { ...frame, anchors: [
    { ...frame.anchors[0]!, id: 'q', surface: 'quote', label: '本末' },
    { ...frame.anchors[0]!, id: 'm', surface: 'meaning', label: '根本' },
    ...frame.anchors,
  ] };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以从先后辨别轻重。', anchorIds: ['q', 'm', 'a'] }] });
  const [result] = await reviewRelations([expanded], '', '本末', [], new AbortController().signal);
  expect(result!.anchors.map(anchor => [anchor.id, anchor.surface])).toEqual([['q', 'quote'], ['m', 'meaning'], ['a', 'reflection']]);
  for (const anchor of result!.anchors) {
    expect(result![anchor.surface!].slice(anchor.start, anchor.end)).toBe(anchor.label);
    expect(anchor.target).toEqual(frame.anchors[0]!.target);
  }
  expect(result!.reflectionSpans.filter(span => span.anchorId).map(span => span.anchorId)).toEqual(['a']);
});
test('unrelated nodes and ungrounded links disappear instead of being made clickable', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: false, reflection: '未找到合适联系。', anchorIds: [] }] });
  expect(await reviewRelations([frame], '', '本末', [], new AbortController().signal)).toEqual([]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以辨别轻重。', anchorIds: ['a'] }] });
  const result = await reviewRelations([frame], '', '本末', [], new AbortController().signal);
  expect(result[0]!.anchors).toEqual([]);
  expect(result[0]!.reflectionSpans).toEqual([{ text: '可以辨别轻重。' }]);
});

test('review removes a rejected branch while preserving the accepted parent and its quote', async () => {
  const conflict: FlowFrame = { ...frame, quote: '何以报德？以直报怨，以德报德。',
    reflection: '不撕破脸也可以分清是非。', anchors: [{ ...frame.anchors[0]!, id: 'boundary', label: '是非',
      sense: '公正的边界', direction: '如何维护是非边界',
      target: { sourceId: 'other', quote: '不患无位，患所以立。', meaning: '不忧没有地位，忧自己凭何立身。' } }] };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true,
    reflection: '不撕破脸也可以分清是非。', anchorIds: [] }] });
  const result = await reviewRelations([conflict], '同事冒领功劳，我生气，又不想闹僵。', '维护公正边界', [], new AbortController().signal);
  expect(result[0]!.quote).toBe(conflict.quote);
  expect(result[0]!.anchors).toEqual([]);
  const prompt = jest.mocked(flowJson).mock.calls.at(-1)![0];
  expect(prompt).toContain('逐一核对每个入口');
  expect(prompt).toContain('心理归因必须有 seed 的明确依据');
});
