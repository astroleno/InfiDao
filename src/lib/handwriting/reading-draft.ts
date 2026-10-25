import { HANDWRITING_VERSION, RENDERER_VERSION, type GenerationContent, type KeepsakeSource, type ReadingKeepsakeDraft } from './contracts';

export const transmissionText = (text: string) => text.replace(/\r\n?/g, '\n');
export async function noteRevision(note: { updatedAt: number; text: string }) {
  return String(note.updatedAt) + ':' + await sha256(JSON.stringify(note.text));
}
export function createReadingDraft(source: KeepsakeSource): ReadingKeepsakeDraft {
  return {
    ...source, sourceRef: { ...source.sourceRef }, draftId: crypto.randomUUID(), createdAt: Date.now(),
    dateLabel: new Date(source.date ?? Date.now()).toLocaleDateString('zh-CN'),
    signature: '', styleCode: '', layout: 'cream', layoutVersion: HANDWRITING_VERSION, contentDigest: '',
    included: { quote: true, source: true, note: !!source.noteText, date: true, signature: false },
  };
}

/** Source identifiers and unselected text deliberately never enter this value. */
export function generationContent(draft: ReadingKeepsakeDraft): GenerationContent {
  const parts = [
    ['quote', draft.quote], ['source', [draft.sourceLabel, draft.chapterLabel].filter(Boolean).join(' · ')],
    ['note', draft.noteText || ''], ['date', draft.dateLabel], ['signature', draft.signature],
  ] as const;
  let text = '';
  const blocks: GenerationContent['blocks'] = [];
  for (const [role, raw] of parts) {
    if (!draft.included[role] || !raw) continue;
    const value = transmissionText(raw);
    if (text) text += '\n\n';
    const start = text.length;
    text += value;
    blocks.push({ role, start, end: text.length });
  }
  return { text, blocks, styleCode: draft.styleCode, layout: draft.layout,
    model: 'lyric-1', pen: { type: 'original', color: 'black', weight: 0, ink: 0 },
    layoutVersion: HANDWRITING_VERSION, rendererVersion: RENDERER_VERSION, label: 'visible' };
}

/** An explicit ordered tuple gives browser and server identical UTF-8 hashing. */
export function digestInput(scope: string, content: GenerationContent) {
  return JSON.stringify(['InfiDao', scope, content.text, content.blocks.map(block => [block.role, block.start, block.end]),
    content.styleCode, content.layout, content.model, content.pen.type, content.pen.color, content.pen.weight, content.pen.ink,
    content.layoutVersion, content.rendererVersion, content.label]);
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
export const contentDigest = (scope: string, content: GenerationContent) => sha256(digestInput(scope, content));
export const sourceKey = (source: KeepsakeSource) => JSON.stringify([
  source.sourceRef.pathId || '', source.sourceRef.frameId || '', source.sourceRef.noteId || '',
  source.quote, source.sourceLabel, source.chapterLabel,
]);
