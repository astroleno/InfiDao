/** @jest-environment node */
import { createReadingGraph, nodeId } from '@/lib/flow-browser/graph';
import { createReadingStorage, type FlowPathRecord, type ReadingPersistence } from '@/lib/flow-browser/storage';
import type { FlowFrame } from '@/lib/flow/contracts';

const first: FlowFrame = { id: 'a', ordinal: 0, sourceId: 'lunyu-1', corpusVersion: 'v1', textHash: 'h-a',
  quote: '学而时习之，不亦说乎？', fullText: '学而时习之，不亦说乎？', quoteStart: 0, quoteEnd: 11,
  source: '论语', chapterLabel: '学而', meaning: '', reflection: '从温习理解学习。', reflectionSpans: [], provenance: 'curated', ready: true,
  anchors: [{ id: 'a-word', label: '习', surface: 'quote', start: 3, end: 4, sense: '温习所学',
    direction: '对照主动温习与后天习染。', terms: ['学习'], topics: ['学习'], relationType: 'contrast',
    target: { sourceId: 'lunyu-17', quote: '性相近也，习相远也。', meaning: '后天习染使人渐远。' } }] };
const second: FlowFrame = { ...first, id: 'b', sourceId: 'lunyu-17', textHash: 'h-b',
  quote: '性相近也，习相远也。', fullText: '性相近也，习相远也。', quoteEnd: 10, chapterLabel: '阳货',
  knowledge: { sense: '温习所学', topics: ['学习'], relation: { type: 'contrast', description: '把主动温习与后天习染放在一起，考察学习如何形成习惯。' } },
  anchors: [{ ...first.anchors[0]!, id: 'b-word', start: 5, end: 6, sense: '后天的习惯与习染', topics: ['学习', '习惯'],
    target: { sourceId: 'lunyu-1', quote: first.quote, meaning: '温习所学。' } }] };
const path = (id: string, frame: FlowFrame): FlowPathRecord => ({ pathId: id,
  chain: { chainId: id, frames: [frame], seed: '', seedOrigin: 'example', focus: '学习', kind: 'curated' },
  snapshot: { version: 1, position: 0, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, readingPositions: {}, ribbon: null },
  parentPathId: null, sourceLabel: '初读', createdAt: 1, updatedAt: 1 });
function fixture() {
  const disk = { paths: new Map<string, any>(), notes: new Map<string, any>(), meta: new Map<string, any>(),
    graphNodes: new Map<string, any>(), graphEdges: new Map<string, any>(), graphVisits: new Map<string, any>() };
  const backend: ReadingPersistence = {
    read: async (store, key) => structuredClone(disk[store].get(key)),
    list: async store => structuredClone([...disk[store].values()]),
    write: async changes => { for (const item of changes) {
      if (item.remove) disk[item.store].delete(item.key); else disk[item.store].set(item.key, structuredClone(item.value));
    } },
  };
  const storage = createReadingStorage(backend);
  return { disk, backend, storage, graph: createReadingGraph(storage) };
}

test('legacy graph migration preserves reading data and separates contextual senses while sharing a topic', async () => {
  const f = fixture();
  await f.storage.savePath(path('old-a', first)); await f.storage.savePath(path('old-b', second));
  await f.storage.saveDraft('未提交的一念'); await f.storage.saveNoteDraft('original-note', '注脚草稿');
  await f.storage.saveNote({ id: 'kept-note', pathId: 'old-a', chainId: 'old-a', frameId: first.id, text: '已有注脚', createdAt: 1, updatedAt: 1 });
  await f.storage.saveBookmark({ kind: 'bookmark', key: 'library:bookmark:keep', pathId: 'old-a', chainId: 'old-a', frameId: first.id,
    quote: first.quote, source: first.source, chapterLabel: first.chapterLabel, snapshot: path('old-a', first).snapshot, createdAt: 1, updatedAt: 1 });
  await f.storage.activate('old-a'); f.disk.meta.set('graph:version', 2);
  const library = await f.graph.library();
  expect(await f.storage.graphVersion()).toBe(4);
  expect(await f.storage.latest()).toBe('old-a'); expect(await f.storage.loadDraft()).toBe('未提交的一念');
  expect(await f.storage.loadNoteDraft('original-note')).toBe('注脚草稿'); expect(await f.storage.listPaths()).toHaveLength(2);
  expect((await f.storage.listAllNotes())[0]?.text).toBe('已有注脚'); expect((await f.storage.listBookmarks())[0]?.quote).toBe(first.quote);
  const senses = library.entries.filter(entry => entry.node.kind === 'sense');
  expect(senses).toHaveLength(2); expect(new Set(senses.map(entry => entry.node.id)).size).toBe(2);
  expect(senses.map(entry => entry.detail)).toEqual(expect.arrayContaining(['温习所学', '后天的习惯与习染']));
  const topic = library.entries.find(entry => entry.node.kind === 'topic' && entry.label === '学习')!;
  expect(library.connections.filter(link => link.to === topic.node.id).length).toBeGreaterThanOrEqual(2);
  expect(senses.find(entry => entry.detail === '温习所学')!.original).toEqual({ pathId: 'old-a', frameId: 'a', source: true });
  const refreshed = await createReadingGraph(createReadingStorage(f.backend)).library();
  expect(refreshed.entries.map(entry => entry.node.id).sort()).toEqual(library.entries.map(entry => entry.node.id).sort());
});

test('legacy lexical addresses recover their stored senses without treating modern gloss words as ancient text', async () => {
  const f = fixture(), origin = { ...first, anchors: [], meaning: '温习学过的内容。' };
  const destination = { ...second, anchors: [] }; delete destination.knowledge;
  const parent = path('legacy-parent', origin);
  await f.graph.put(parent);
  const quoted = { ...path('legacy-quote', destination), parentPathId: parent.pathId,
    parentEntry: { fromFrameId: 'a', anchorId: 'text:3:4', label: '习' } };
  quoted.chain.focus = '「习」在《论语》原文此处：温习已经学过的内容；对照主动学习与后天习惯。';
  await f.graph.put(quoted);
  const glossed = { ...path('legacy-gloss', destination), parentPathId: parent.pathId,
    parentEntry: { fromFrameId: 'a', anchorId: 'meaning:0:2', label: '温习' } };
  glossed.chain.focus = '「温习」在《论语》的现代释义中：对所学内容再加学习；继续考察学习与习惯。';
  await f.graph.put(glossed);
  const library = await f.graph.library();
  expect(library.entries.find(entry => entry.node.kind === 'sense' && entry.label === '习')).toMatchObject({ detail: '温习已经学过的内容', node: { surface: 'quote' } });
  expect(library.entries.find(entry => entry.node.kind === 'sense' && entry.label === '温习')).toMatchObject({ detail: '对所学内容再加学习', source: '论语 · 学而 · 释义', node: { surface: 'meaning' } });
  expect(library.entries.filter(entry => entry.node.kind === 'topic').map(entry => entry.label)).toEqual(expect.arrayContaining(['习', '温习']));
  const repeat = await f.graph.child(parent.pathId, 'a', 'different-temporary-id', { start: 3, end: 4, textHash: first.textHash, corpusVersion: first.corpusVersion });
  expect(repeat?.chain.frames[0].quote).toBe(second.quote);
});

test('revisiting a word retains semantic nodes and the validated relationship without adding a generated call', async () => {
  const f = fixture(), parent = path('a-path', first);
  await f.graph.put(parent);
  const child = { ...path('b-path', second), parentPathId: parent.pathId,
    parentEntry: { fromFrameId: 'a', anchorId: 'a-word', label: '习', selection: { start: 3, end: 4, textHash: 'h-a', corpusVersion: 'v1' } } };
  await f.graph.commitBranch(parent, child);
  const before = await f.graph.library();
  const edge = before.connections.find(link => link.from === nodeId(first) && link.to === nodeId(second))!;
  expect(edge).toMatchObject({ label: '对照 · 沿「习」', description: second.knowledge!.relation.description });
  const replay = await f.graph.child(parent.pathId, 'a', 'temporary-anchor-id', child.parentEntry.selection);
  expect(replay?.chain.frames[0].quote).toBe(second.quote);
  const after = await f.graph.library();
  expect(after.entries.map(entry => entry.node.id).sort()).toEqual(before.entries.map(entry => entry.node.id).sort());
  expect(after.connections.map(link => link.id).sort()).toEqual(before.connections.map(link => link.id).sort());
  expect((await f.storage.listPaths()).length).toBe(3);
});

test('unreviewed streaming metadata does not enter the knowledge projection and stale partials cannot replace it', async () => {
  const f = fixture();
  await f.graph.put(path('stream', { ...second, ready: false }));
  expect((await f.graph.library()).entries.filter(entry => ['sense', 'topic'].includes(entry.node.kind))).toEqual([]);
  await f.graph.put(path('stream', second));
  const complete = await f.graph.library();
  await f.graph.put(path('stream', { ...second, ready: false, anchors: [], knowledge: { topics: ['错误主题'], relation: { type: 'cause', description: '尚未核验的因果。' } } }));
  const late = await f.graph.library();
  expect(late.entries.map(entry => entry.label).sort()).toEqual(complete.entries.map(entry => entry.label).sort());
  expect(late.entries.some(entry => entry.label === '错误主题')).toBe(false);
});

test('a failed migration remains available in the session and is retried by a new graph instance', async () => {
  const f = fixture(); await f.storage.savePath(path('old-a', first));
  const original = f.backend.write;
  f.backend.write = async () => { throw new Error('quota'); };
  expect((await f.graph.library()).entries.some(entry => entry.node.kind === 'sense')).toBe(true);
  expect(f.graph.status().persisted).toBe(false); expect(f.disk.meta.get('graph:version')).not.toBe(4);
  f.backend.write = original;
  await createReadingGraph(createReadingStorage(f.backend)).initialize();
  expect(f.disk.meta.get('graph:version')).toBe(4);
});
