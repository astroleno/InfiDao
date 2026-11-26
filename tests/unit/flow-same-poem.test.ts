/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { activePoetryPassage, resetContentStore } from '@/lib/content/store';
import { resolveContentScope } from '@/lib/content/scope';
import { candidatesFor } from '@/lib/flow/candidates';
import { compactCandidates, unreadPoemExcerpt } from '@/lib/flow/context';
import type { FlowChain, FlowEvent, FlowFrame, FlowRequest } from '@/lib/flow/contracts';
import { lexicalBreaks } from '@/lib/flow/lexemes';
import { flowJson } from '@/lib/flow/model';
import { runFlow } from '@/lib/flow/service';
import { createSessionStore, MemoryDocumentBackend } from '@/lib/flow/session-store';
import frozen from '../../docs/qa/flow-blind/2026-11-26-batch2-fixed-points.json';

jest.mock('@/lib/flow/model', () => ({ flowJson: jest.fn(), flowModelConfig: () => ({ model: 'same-poem-fixture' }) }));
const sqliteAvailable = Boolean(process.getBuiltinModule?.('node:sqlite'));
const withPoetry = sqliteAvailable ? describe : describe.skip;
const points = frozen.cases.filter(entry => entry.point && entry.group === 'poetry');
const owner = 'same-poem-qa';
const scopeIds = ['core', 'poetry'] as const;
type RetrievalObserver = NonNullable<Parameters<typeof runFlow>[5]>;
const reviewText = {
  P1: '花与鸟增加了春景的感情层次：花引出对时局的悲伤，鸟声牵动离别之愁，于是草木的繁茂也可以衬出人的悲意。',
  P2: '同为离乡做官的人，是这场送别的共同处境。先读到这份共同经历，后面的宽慰就有了说话人与友人的具体关系。',
  P3: '从乌啼转向半夜的钟声，声音标出了从城外寒山寺到客船的距离。听到钟的人仍在泊船上，夜里的位置也因此具体了。',
};

afterAll(resetContentStore);

withPoetry('source-backed same-poem recall', () => {
  beforeEach(() => jest.clearAllMocks());

  async function setup(entry: Pick<(typeof points)[number], 'point' | 'terms' | 'need'> = points[0]!,
    options: { legacy?: boolean; priorQuotes?: string[] } = {}) {
    const scope = await resolveContentScope([...scopeIds]), point = entry.point!;
    const passage = (await activePoetryPassage(point.sourceId, scope.versions.poetry!))!;
    expect(passage).toMatchObject({ corpusVersion: point.corpusVersion, textHash: point.textHash, text: point.passage });
    const frame: FlowFrame = {
      id: 'parent-frame', ordinal: 1, sourceId: passage.id, source: passage.source, chapterLabel: passage.chapter,
      work: passage.work!, corpusVersion: passage.corpusVersion, textHash: passage.textHash, fullText: passage.text,
      quote: point.text, quoteStart: point.start, quoteEnd: point.end, lexicalBreaks: lexicalBreaks(passage.text),
      meaning: '今日读来', textBreaks: { meaning: [2, 4], reflection: [] },
      reflection: '先看这一联所呈现的场景与关系。', reflectionSpans: [], anchors: [], provenance: 'model', ready: true,
    };
    const store = createSessionStore(new MemoryDocumentBackend(), { createId: randomUUID });
    const seedParent = async () => {
      const chain: FlowChain = {
        chainId: 'parent', version: 'fixture', seed: entry.need, seedOrigin: 'user', focus: entry.need,
        parentChainId: null, entry: null, frames: [frame], cursor: '1', exhausted: false, contentScope: scope, kind: 'remote',
        ...(options.legacy ? {} : { graph: true as const }),
      };
      const lease = (await store.reserve(owner, { requestId: 'parent', key: 'parent', fingerprint: 'parent' })).lease!;
      await store.commitHead(owner, lease, {
        owner, chain, terms: entry.terms, seen: [frame.sourceId], nodes: { [frame.id]: frame }, branches: {},
        generationKey: 'parent', updated: Date.now(), recentReadings: [], priorQuotes: options.priorQuotes ?? [],
      });
    };
    const requestFor = (start: number, end: number): FlowRequest => ({
      op: 'branch', requestId: 'child', chainId: 'parent', fromFrameId: frame.id,
      selection: { start, end, corpusVersion: frame.corpusVersion, textHash: frame.textHash },
    });
    const click = frame.lexicalBreaks!.map((end, index) => ({ start: frame.lexicalBreaks![index - 1] ?? 0, end }))
      .find(({start, end}) => start >= point.tokenStart && end <= point.tokenEnd && /\p{L}/u.test(frame.fullText.slice(start, end)))!;
    const request = requestFor(click.start, click.end);
    const plan = { sense: '此处诗句中的意象', direction: entry.need, terms: entry.terms };
    const observer = jest.fn<ReturnType<RetrievalObserver>, Parameters<RetrievalObserver>>();
    const events: FlowEvent[] = [];
    const run = () => runFlow(request, owner, new AbortController().signal, event => events.push(event), store, observer);
    const restartFrom = {
      sourceId: frame.sourceId, corpusVersion: frame.corpusVersion, textHash: frame.textHash,
      quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd,
    };
    return { scope, frame, request, requestFor, restartFrom, plan, observer, events, run, seedParent, store };
  }

  test.each(points.map(entry => [entry.id, entry] as const))('%s reaches generation and independent review with the exact unread evidence', async (id, entry) => {
    const { seedParent, frame, plan, observer, events, run } = await setup(entry);
    await seedParent();
    const evidence = entry.evidence[0]!, reflection = reviewText[id as keyof typeof reviewText];
    jest.mocked(flowJson).mockResolvedValueOnce(plan)
      .mockImplementationOnce(async (_prompt, input) => {
        expect(events).toEqual([]);
        const retrieval = observer.mock.calls[0]![0];
        expect(retrieval.force).toBeUndefined();
        expect(retrieval.recalled.length).toBeLessThanOrEqual(40);
        expect(retrieval.recalled[0]?.sourceId).toBe(frame.sourceId);
        expect(retrieval.compact.length).toBeLessThanOrEqual(12);
        const window = retrieval.compact[0]!;
        const supplied = (input as { candidates: Array<{ sourceId: string; excerptStart?: number; text: string }> }).candidates;
        expect(supplied.every(candidate => candidate.text.length > 0 && candidate.text.length <= 480)).toBe(true);
        expect(supplied.filter(candidate => candidate.sourceId === frame.sourceId)).toEqual([
          expect.objectContaining({ excerptStart: window.start, text: frame.fullText.slice(window.start, window.end) }),
        ]);
        expect(window).toMatchObject({ sourceId: evidence.sourceId, corpusVersion: evidence.corpusVersion, textHash: evidence.textHash });
        expect(window.start).toBeLessThanOrEqual(evidence.start);
        expect(window.end).toBeGreaterThanOrEqual(evidence.end);
        return { frames: [{ sourceId: evidence.sourceId, quote: evidence.text, quoteStart: evidence.start,
          meaning: '', reflection, relevance: 0.95, anchors: [] }] };
      })
      .mockImplementationOnce(async (_prompt, input, _signal, stream) => {
        expect(events).toEqual([]);
        const candidate = (input as { frames: Array<{ id: string; quote: string }> }).frames[0]!;
        expect(candidate.quote).toBe(evidence.text);
        const result = { frames: [{ id: candidate.id, relevant: true, advance: reflection.slice(0, 20), meaning: '', reflection, anchorIds: [] }] };
        await stream?.onProgress(result);
        return result;
      });
    await run();
    expect(jest.mocked(flowJson)).toHaveBeenCalledTimes(3);
    expect(events.map(event => event.type)).toEqual(['head', 'frame', 'done']);
    expect(events.at(-1)).toMatchObject({ chain: { frames: [{
      sourceId: evidence.sourceId, quote: evidence.text, quoteStart: evidence.start, quoteEnd: evidence.end, ready: true,
    }] } });
  });

  test.each(['legacy', 'disabled pack', 'meaning', 'outside the current quote', 'changed work span', 'invalid quote end', 'already read poem', 'scope rebase'])(
    'keeps normal recall and compaction for %s', async guard => {
      const priorQuotes = guard === 'already read poem' ? points[0]!.point!.passage.split('\n').slice(1) : [];
      const { seedParent, frame, request, requestFor, restartFrom, plan, run, observer } = await setup(
        guard === 'invalid quote end' ? points[1] : points[0], { legacy: guard === 'legacy', priorQuotes });
      if (guard === 'disabled pack') request.contentPacks = ['core'];
      if (guard === 'meaning') request.selection = { ...requestFor(0, 2).selection!, surface: 'meaning', surfaceText: frame.meaning };
      if (guard === 'outside the current quote') {
        const start = frame.quoteEnd + 1;
        request.selection = requestFor(start, frame.lexicalBreaks!.find(end => end > start)!).selection!;
      }
      if (guard === 'changed work span') frame.work!.end++;
      if (guard === 'invalid quote end') {
        frame.quote = frame.fullText.slice(frame.quoteStart);
        frame.quoteEnd = frame.fullText.length + 1;
      }
      if (guard === 'scope rebase') {
        request.op = 'open'; request.restartFrom = restartFrom;
        request.rebaseFrom = { chainId: request.chainId!, frameId: request.fromFrameId! };
        delete request.chainId; delete request.fromFrameId;
      }
      await seedParent();
      jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [] });
      await expect(run()).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
      const retrieval = observer.mock.calls[0]![0];
      const baseline = await candidatesFor([...retrieval.terms], retrieval.focus, new Set(retrieval.exclude), undefined, [], [...retrieval.scope.packIds]);
      expect(retrieval.recalled.map(row => row.sourceId)).toEqual(baseline.map(row => row.id));
      expect(retrieval.compact).toEqual(compactCandidates(baseline, [...retrieval.terms], undefined, [...retrieval.previousQuotes]).windows);
    },
  );

  test.each(points.map(entry => [entry.id, entry] as const))('%s can restart from the canonical verse selection without its expired parent session', async (id, entry) => {
    const { frame, request, restartFrom, plan, run, events, observer } = await setup(entry);
    const target = entry.evidence[0]!, reflection = reviewText[id as keyof typeof reviewText];
    request.op = 'open'; request.restartFrom = restartFrom;
    request.graph = true; request.contentPacks = [...scopeIds];
    delete request.chainId; delete request.fromFrameId;
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({
      frames: [{ sourceId: frame.sourceId, quote: target.text, quoteStart: target.start, meaning: '', reflection, relevance: .9, anchors: [] }],
    }).mockImplementationOnce(async (_prompt, input) => {
      const [{ id }] = (input as { frames: [{ id: string }] }).frames;
      expect(events).toEqual([]);
      return { frames: [{ id, relevant: true, advance: reflection.slice(0, 20), meaning: '', reflection, anchorIds: [] }] };
    });
    await run();
    const retrieval = observer.mock.calls[0]![0];
    expect(retrieval).toMatchObject({ op: 'open', previousQuotes: [frame.quote] });
    expect(retrieval.compact[0]).toMatchObject({ sourceId: frame.sourceId, start: target.start });
    expect(events.at(-1)).toMatchObject({ type: 'done', chain: { frames: [{ quote: target.text, quoteStart: target.start }] } });
  });

  test('an explicit resume before any head reuses the stored canonical selection and plan', async () => {
    const { frame, seedParent, plan, run, events, observer, store } = await setup();
    await seedParent();
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error('fixture interrupted'));
    await expect(run()).rejects.toThrow('fixture interrupted');
    expect(events).toEqual([]);
    const chainId = Object.values((await store.getChain(owner, 'parent')).branches)[0]!;
    expect((await store.getChain(owner, chainId)).poetrySelection).toMatchObject({ sourceId: frame.sourceId });
    const target = points[0]!.evidence[0]!;
    jest.mocked(flowJson).mockResolvedValueOnce({
      frames: [{ sourceId: frame.sourceId, quote: target.text, quoteStart: target.start, meaning: '', reflection: reviewText.P1, relevance: .9, anchors: [] }],
    }).mockImplementationOnce(async (_prompt, input) => {
      const [{ id }] = (input as { frames: [{ id: string }] }).frames;
      return { frames: [{ id, relevant: true, advance: '花和鸟承接春景中的悲伤', meaning: '', reflection: reviewText.P1, anchorIds: [] }] };
    });
    await runFlow({ op: 'open', chainId, requestId: 'resume' }, owner, new AbortController().signal,
      event => events.push(event), store, observer);
    expect(observer.mock.calls[1]![0].compact).toEqual(observer.mock.calls[0]![0].compact);
    expect(jest.mocked(flowJson)).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toMatchObject({ type: 'done', chain: { frames: [{ quote: target.text, quoteStart: target.start }] } });
    expect((await store.getChain(owner, chainId)).poetrySelection).toBeUndefined();
  });

  test('without literal matches the nearest unread line reaches the model even when the model rejects it', async () => {
    const { frame, seedParent, plan, run, events, observer } = await setup(points[1]);
    await seedParent();
    plan.terms = ['故地重游', '無盡追懷'];
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [] });
    await expect(run()).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
    expect(events).toEqual([]);
    const window = observer.mock.calls[0]![0].compact[0]!;
    expect(window).toMatchObject({ start: frame.quoteEnd + 1, sourceId: frame.sourceId });
    expect(frame.fullText.slice(window.start, window.end)).toBe('無爲在岐路，兒女共霑巾。');
  });

  test('an independent review can reject the new poem evidence without delivering it', async () => {
    const { seedParent, events, plan, run } = await setup();
    await seedParent();
    const evidence = points[0]!.evidence[0]!;
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({
      frames: [{ sourceId: evidence.sourceId, quote: evidence.text, quoteStart: evidence.start,
        meaning: '', reflection: '花鸟意象进一步承接景与情。', relevance: 0.95, anchors: [] }],
    }).mockResolvedValueOnce({ frames: [] });
    await expect(run()).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
    expect(events).toEqual([]);
    expect(flowJson).toHaveBeenCalledTimes(3);
  });

  test('the existing prepared anchor still delivers its head before retrieval', async () => {
    const { seedParent, frame, request, plan, events, observer, run } = await setup();
    const { start, end } = request.selection!;
    const target = points[1]!.evidence[0]!;
    frame.anchors = [{
      id: 'prepared', surface: 'quote', label: frame.fullText.slice(start, end),
      start: start - frame.quoteStart, end: end - frame.quoteStart,
      sense: plan.sense, direction: plan.direction, terms: plan.terms,
      target: { sourceId: target.sourceId, quote: target.text, meaning: '' },
    }];
    await seedParent();
    jest.mocked(flowJson).mockImplementationOnce(async () => {
      expect(events[0]).toMatchObject({ type: 'head', chain: { frames: [{ sourceId: target.sourceId, quote: target.text }] } });
      expect(observer.mock.calls[0]![0].force).toEqual({ sourceId: target.sourceId, quote: target.text });
      return { frames: [{ sourceId: target.sourceId, quote: target.text, meaning: '',
        reflection: '计划中的送别视角。', relevance: 0.95, anchors: [] }] };
    }).mockImplementationOnce(async (_prompt, input) => {
      const [{ id }] = (input as { frames: [{ id: string }] }).frames;
      return { frames: [{ id, relevant: true, advance: '把送别放回同是宦游人的处境', meaning: '', reflection: reviewText.P2, anchorIds: [] }] };
    });
    await run();
    expect(flowJson).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', chain: { frames: [{ sourceId: target.sourceId, quote: target.text }] } });
  });

  test('a long work can supply one adjacent passage with passage-local offsets', async () => {
    const version = (await resolveContentScope([...scopeIds])).versions.poetry!;
    const prefix = 'poetry-0e528f3b2b84e8d53f606e85ff867072';
    const [parent, neighbor] = await Promise.all([
      activePoetryPassage(prefix + '-0', version),
      activePoetryPassage(prefix + '-198', version),
    ]);
    const start = lexicalBreaks(parent!.text)[0]!, text = parent!.text.slice(0, parent!.text.indexOf('\n'));
    const point = {
      ...points[0]!.point!, sourceId: parent!.id, corpusVersion: parent!.corpusVersion, textHash: parent!.textHash,
      passage: parent!.text, text, start: 0, end: text.length, token: text.slice(0, start), tokenStart: 0, tokenEnd: start,
    };
    const terms = ['永懷前事', '舅館接山扉'], quote = '永懷前事不自適，却指舅館接山扉。';
    expect(terms.some(term => parent!.text.includes(term))).toBe(false);
    const { seedParent, events, plan, observer, run } = await setup({ need: points[0]!.need, point, terms });
    await seedParent();
    const quoteStart = neighbor!.text.indexOf(quote);
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({
      frames: [{ sourceId: neighbor!.id, quote, quoteStart, meaning: '', reflection: '旧游之地唤起了对往事的追怀。', relevance: 0.95, anchors: [] }],
    }).mockImplementationOnce(async (_prompt, input) => {
      const [{ id }] = (input as { frames: [{ id: string }] }).frames;
      return { frames: [{ id, relevant: true, advance: '由记忆中的重逢进入今日重访', meaning: '', reflection: '诗句从久远的回忆转向重访时眼前仍可辨认的旧地。', anchorIds: [] }] };
    });
    await run();
    expect(observer.mock.calls[0]![0].compact[0]).toMatchObject({ sourceId: neighbor!.id, start: quoteStart, end: quoteStart + quote.length });
    expect(events.at(-1)).toMatchObject({ chain: { frames: [{ sourceId: neighbor!.id, quote, quoteStart, ready: true }] } });
  });
});

test('a useful verse window preserves the selected UTF-16 start even for a repeated substring', () => {
  const text = '前峰落日，清泉石上流。\n別句無關。\n清泉石上流。';
  const origin = { start: 0, end: text.indexOf('\n') };
  const excerpt = unreadPoemExcerpt(text, ['清泉石上流'], ['前峰落日'], origin);
  expect(excerpt).toMatchObject({ text: '清泉石上流。', start: text.lastIndexOf('清泉石上流'), end: text.length });
  const row = { id: 'verse', text, work: {} } as Parameters<typeof compactCandidates>[0][number];
  const compact = compactCandidates([row], ['清泉石上流'], undefined, ['前峰落日'], { sourceId: row.id, excerpt: excerpt! });
  expect(compact.input[0]?.excerptStart).toBe(excerpt!.start);
  expect(compact.windows[0]).toMatchObject({ start: excerpt!.start, end: excerpt!.end });
  expect(unreadPoemExcerpt(text, ['晚鐘'], [], origin)?.text).toBe('別句無關。');
  expect(unreadPoemExcerpt('！\n。\n𠮷。', ['清泉'], [], origin)).toBeUndefined();
});
