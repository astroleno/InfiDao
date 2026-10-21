import type { FlowFrame } from '@/lib/flow/contracts';
import { readingStorage, type FlowPathRecord, type PersonalNote, type NoteContext, type ReadingSnapshot } from './storage';

export type SavedTarget = { pathId: string; frameId?: string; snapshot?: ReadingSnapshot; notes?: boolean; source?: boolean };
export type LibraryNote = PersonalNote & { context?: NoteContext; target?: SavedTarget };
export const quoteKey = (frame: FlowFrame) => 'library:bookmark:' + JSON.stringify([frame.sourceId, frame.corpusVersion, frame.textHash, frame.quoteStart, frame.quoteEnd]);
export const noteContext = (frame: FlowFrame): NoteContext => ({ quote: frame.quote, source: frame.source, chapterLabel: frame.chapterLabel });

export function snapshotFrame(record: FlowPathRecord, snapshot = record.snapshot): FlowFrame | null {
  const frames = record.chain.frames as FlowFrame[];
  const explicit = frames.find(frame => frame.id === snapshot.activeFrameId);
  if (explicit) return explicit;
  if (!frames.length) return null;
  const { FlowTimeline, CELL, CENTER_PHASE } = require('../../../shared/flow/timeline');
  const { RibbonWindow, SLOT_COUNT } = require('../../../shared/flow/ribbon-window');
  const { readingLines } = require('../../../shared/flow/scene');
  const cursor = snapshot.position / CELL - CENTER_PHASE + snapshot.rowOffset;
  const ribbon = new RibbonWindow(readingLines(frames), cursor, snapshot.ribbon, snapshot.rowOffset);
  const rows = ribbon.frames(cursor);
  const timeline = new FlowTimeline(SLOT_COUNT);
  timeline.position = snapshot.position;
  timeline.centers = rows.map((row: { centerOffset?: number } | undefined) => row?.centerOffset || 0);
  return frames.find(frame => frame.id === rows[timeline.index]?.passageId) || frames[0] || null;
}

export function savedSnapshot(record: FlowPathRecord, target: SavedTarget): ReadingSnapshot {
  const saved = target.snapshot || record.snapshot;
  const base = target.source ? { ...saved, sourceOpen: true, readingPositions: { ...saved.readingPositions, reader: 0 } } : saved;
  const current = snapshotFrame(record, base);
  if (!target.frameId || current?.id === target.frameId) return { ...base, ...(current ? { activeFrameId: current.id,
    ...(target.source ? { activeEntryKey: `${record.pathId}:${current.id}` } : {}) } : {}), paused: true };
  const { CELL, CENTER_PHASE } = require('../../../shared/flow/timeline');
  const { RibbonWindow } = require('../../../shared/flow/ribbon-window');
  const { readingLines } = require('../../../shared/flow/scene');
  const ribbon = new RibbonWindow(readingLines(record.chain.frames), 0);
  ribbon.seek(target.frameId, 0);
  const activeEntryKey = `${record.pathId}:${target.frameId}`;
  return { ...base, activeFrameId: target.frameId, activeEntryKey, paused: true, position: CELL * CENTER_PHASE, rowOffset: 0, ribbon: ribbon.snapshot(),
    readingPositions: { ...base.readingPositions, reader: target.source ? 0 : base.readingPositions[activeEntryKey + ':reader'] || base.readingPositions[target.frameId + ':reader'] || 0, source: base.readingPositions[target.frameId + ':source'] || 0 } };
}

export function resolveNotes(notes: PersonalNote[], paths: FlowPathRecord[]): LibraryNote[] {
  return notes.map(note => {
    const path = paths.find(record => (!note.pathId || note.pathId === record.pathId) && record.chain.chainId === note.chainId && record.chain.frames.some((frame: FlowFrame) => frame.id === note.frameId));
    const frame = path?.chain.frames.find((item: FlowFrame) => item.id === note.frameId);
    return { ...note, ...(!note.context && frame ? { context: noteContext(frame) } : {}),
      ...(path ? { target: { pathId: path.pathId, frameId: note.frameId, notes: true } } : {}) };
  });
}

export async function loadLibrary() {
  const [paths, bookmarks, notes] = await Promise.all([readingStorage.listPaths(), readingStorage.listBookmarks(), readingStorage.listAllNotes()]);
  return { paths, bookmarks, notes: resolveNotes(notes, paths) };
}

export function exportNotesMarkdown(notes: LibraryNote[]): string {
  // Quote all user content as plain blockquote lines so Markdown/HTML stays inert.
  const plain = (value: string) => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]!)).replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');
  const block = (value: string) => value.split(/\r?\n/).map(line => '> ' + plain(line)).join('\n');
  return '# 六经注我 · 自己的注脚\n\n' + notes.map(note => [
    '## ' + plain(note.context ? `${note.context.source} · ${note.context.chapterLabel}` : '原阅读记录不可用'),
    note.context ? '经句：\n\n' + block(note.context.quote) : '', '注脚：\n\n' + block(note.text),
    `创建：${new Date(note.createdAt).toISOString()}  \n更新：${new Date(note.updatedAt).toISOString()}`,
  ].filter(Boolean).join('\n\n')).join('\n\n---\n\n') + '\n';
}

export function downloadNotes(notes: LibraryNote[]) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', exportNotesMarkdown(notes)], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `六经注我-注脚-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
