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

test('an easy quotation seals an empty gloss and streams its connection without reinstating paraphrase', async () => {
  const published: FlowFrame[] = [];
  const result = { id: 'f', relevant: true, meaning: '', reflection: '可以先挑出此刻最要紧的一件事，看看其余安排能否围绕它展开。', anchorIds: [] };
  jest.mocked(flowJson).mockImplementationOnce(async (prompt, _input, _signal, stream) => {
    expect(prompt).toContain('易懂经句必须 meaning=""');
    await stream?.onProgress({ frames: [{ id: 'f', relevant: true, meaning: '' }] });
    await stream?.onProgress({ frames: [result] });
    return { frames: [result] };
  });
  const [reviewed] = await reviewRelations([frame], '', '先后', [], new AbortController().signal, undefined,
    async value => { published.push(value); });
  expect(published[0]).toMatchObject({ meaning: '', reflection: '', settled: { meaning: true, reflection: false } });
  expect(published[1]).toMatchObject({ meaning: '', reflection: result.reflection, settled: { meaning: true, reflection: true } });
  expect(reviewed?.meaning).toBe('');
  expect(reviewed?.reflection).toBe(result.reflection);
});

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

test('review sees the actual quote context beyond the old prefix and the actively chosen word', async () => {
  const expanded = { ...frame, fullText: '别章。'.repeat(1000) + frame.quote + '上下文。'.repeat(300) };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以从先后辨别轻重。', anchorIds: [] }] });
  const readingContext = { word: '先后', surface: 'meaning' as const, source: '大学', quote: frame.quote, before: '分辨', after: '与轻重' };
  await reviewRelations([expanded], '旧的心事', '理解次序', [], new AbortController().signal, readingContext);
  const [prompt, input] = jest.mocked(flowJson).mock.calls.at(-1)!;
  expect(prompt).toContain('seed 仅是来路');
  expect(input).toMatchObject({ readingContext, frames: [{ original: expect.stringContaining(frame.quote) }] });
  expect((input as any).frames[0].original.length).toBeLessThanOrEqual(640);
});

test('only independently accepted complete paragraphs are published while review is still running', async () => {
  const published: FlowFrame[] = [];
  jest.mocked(flowJson).mockImplementationOnce(async (_system, _input, _signal, stream) => {
    await stream!.onProgress({ frames: [{ id: 'f' }] });
    expect(published).toHaveLength(0);
    await stream!.onProgress({ frames: [{ id: 'f', relevant: true }] });
    expect(published.at(-1)).toMatchObject({ ready: false, meaning: '', reflection: '' });
    await stream!.onProgress({ frames: [{ id: 'f', relevant: true, meaning: '辨别事物的根本与末节。' }] });
    expect(published.at(-1)).toMatchObject({ ready: false, meaning: '辨别事物的根本与末节。',
      settled: { meaning: true, reflection: false } });
    const result = { frames: [{ id: 'f', relevant: true, meaning: '辨别事物的根本与末节。', reflection: '从此处分清先后。', anchorIds: [] }] };
    await stream!.onProgress(result);
    return result;
  });
  const complete = await reviewRelations([frame], '', '本末', [], new AbortController().signal, undefined,
    async value => { published.push(structuredClone(value)); });
  expect(published).toHaveLength(3);
  expect(published[2]).toMatchObject({ ready: false, settled: { meaning: true, reflection: true } });
  expect(complete[0]).toMatchObject({ ready: true, meaning: published[1]!.meaning, reflection: published[2]!.reflection });
});

test('knowledge is independently reviewed and never published with unfinished paragraphs', async () => {
  const proposal = { topics: ['未经核验的主题'], sense: '提议的词义', relation: { type: 'cause' as const, description: '提议的因果。' } };
  const accepted = { topics: ['先后次序'], sense: '事情安排的先后', relation: { type: 'elaboration' as const, description: '从本末进一步考察安排事情时的先后。' } };
  const published: FlowFrame[] = [];
  jest.mocked(flowJson).mockImplementationOnce(async (_prompt, _input, _signal, stream) => {
    await stream!.onProgress({ frames: [{ id: 'f', relevant: true, meaning: '', reflection: '从本末继续分清先后。', knowledge: proposal }] });
    return { frames: [{ id: 'f', relevant: true, meaning: '', reflection: '从本末继续分清先后。', knowledge: accepted, anchorIds: [] }] };
  });
  const context = { word: '先后', surface: 'meaning' as const, source: '大学', quote: frame.quote, before: '分清', after: '次序' };
  const [result] = await reviewRelations([{ ...frame, knowledge: proposal }], '', '先后', [], new AbortController().signal, context,
    async value => { published.push(value); });
  expect(published).toHaveLength(1); expect(published[0]?.knowledge).toBeUndefined();
  expect(result?.knowledge).toEqual(accepted);
});

test('rejected knowledge cannot leak from the generation proposal and root topics do not invent a selected word', async () => {
  const proposal = { sense: '不应出现的词义', topics: ['次序'], relation: { type: 'related' as const, description: '围绕次序继续阅读。' } };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以从先后辨别轻重。', anchorIds: [] }] });
  const [without] = await reviewRelations([{ ...frame, knowledge: proposal }], '', '次序', [], new AbortController().signal);
  expect(without?.knowledge).toBeUndefined();
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ id: 'f', relevant: true, reflection: '可以从先后辨别轻重。', knowledge: proposal, anchorIds: [] }] });
  const [root] = await reviewRelations([frame], '', '次序', [], new AbortController().signal);
  expect(root?.knowledge?.sense).toBeUndefined(); expect(root?.knowledge?.topics).toEqual(['次序']);
});
