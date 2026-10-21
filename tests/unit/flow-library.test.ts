/** @jest-environment node */
import { exportNotesMarkdown, quoteKey, resolveNotes, savedSnapshot, snapshotFrame } from '@/lib/flow-browser/library';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { FlowPathRecord, PersonalNote } from '@/lib/flow-browser/storage';
const { RibbonWindow } = require('../../shared/flow/ribbon-window');
const { readingLines } = require('../../shared/flow/scene');
const frame = { id: 'f', ordinal: 0, sourceId: 'source', corpusVersion: 'v1', textHash: 'hash', quoteStart: 0, quoteEnd: 4, quote: '知止而定', fullText: '知止而定', source: '大学', chapterLabel: '第一章', anchors: [], lexicalBreaks: [0, 2, 4] } as unknown as FlowFrame;
const second = { ...frame, id: 'second', ordinal: 1, quote: '物有本末', fullText: '物有本末' };
const record: FlowPathRecord = { pathId: 'path', chain: { chainId: 'chain', frames: [frame, second] }, snapshot: { version: 1, position: 512, rowOffset: 0, ambientPhase: 0, paused: false, sourceOpen: false, readingPositions: { 'second:reader': 91 }, ribbon: null, activeFrameId: 'f' }, parentPathId: null, sourceLabel: '最初', createdAt: 1, updatedAt: 1 };
const note: PersonalNote = { id: 'n', chainId: 'chain', frameId: 'f', text: '我的理解\n第二行', createdAt: 1, updatedAt: 2 };

test('bookmarks deduplicate the same quote across chains without conflating source versions', () => {
  expect(quoteKey(frame)).toBe(quoteKey({ ...frame, id: 'other-frame' }));
  expect(quoteKey(frame)).not.toBe(quoteKey({ ...frame, corpusVersion: 'v2' }));
});
test('legacy notes resolve by chain and frame while orphan notes survive', () => {
  const notes = resolveNotes([note, { ...note, id: 'orphan', chainId: 'absent' }], [record]);
  expect(notes[0]).toMatchObject({ context: { quote: frame.quote }, target: { pathId: 'path', frameId: 'f' } });
  expect(notes[1]?.target).toBeUndefined(); expect(notes[1]?.text).toBe(note.text);
  expect(exportNotesMarkdown(notes)).toContain('原阅读记录不可用');
  expect(exportNotesMarkdown(notes)).toContain('> 我的理解\n> 第二行');
  expect(exportNotesMarkdown(resolveNotes([{ ...note, text: '<script>x</script> **test**' }], [record]))).toContain('&lt;script&gt;');
});
test('a targeted frame gets an aligned ribbon and its own reader position', () => {
  const snapshot = savedSnapshot(record, { pathId: 'path', frameId: 'second' });
  const ribbon = new RibbonWindow(readingLines(record.chain.frames), 0, snapshot.ribbon);
  expect(ribbon.frames(0)[0].passageId).toBe('second');
  expect(snapshot).toMatchObject({ paused: true, activeFrameId: 'second', readingPositions: { reader: 91 } });
  expect(record.snapshot.activeFrameId).toBe('f');
  expect(savedSnapshot(record, { pathId: 'path' })).toEqual({ ...record.snapshot, paused: true });
});

test('legacy ribbon snapshots identify their actual active frame without a new activeFrameId field', () => {
  const snapshot = savedSnapshot(record, { pathId: 'path', frameId: 'second' });
  delete snapshot.activeFrameId;
  expect(snapshotFrame({ ...record, snapshot })?.id).toBe('second');
  expect(savedSnapshot({ ...record, snapshot }, { pathId: 'path' })).toMatchObject({ activeFrameId: 'second', readingPositions: { reader: 91 } });
});

test('returning from a knowledge relation opens the requested original without reusing a stale stream offset', () => {
  const stored = { ...record, snapshot: { ...record.snapshot, activeEntryKey: 'path:f', readingPositions: { reader: 900, 'path:second:reader': 1800 } } };
  const snapshot = savedSnapshot(stored, { pathId: 'path', frameId: 'second', source: true });
  expect(snapshot).toMatchObject({ paused: true, sourceOpen: true, activeFrameId: 'second', activeEntryKey: 'path:second', readingPositions: { reader: 0 } });
  expect(stored.snapshot.sourceOpen).toBe(false); expect(stored.snapshot.readingPositions.reader).toBe(900);
});
