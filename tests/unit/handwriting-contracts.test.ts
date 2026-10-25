/** @jest-environment node */
import { webcrypto } from 'node:crypto';
import { contentDigest, createReadingDraft, generationContent, noteRevision } from '@/lib/handwriting/reading-draft';
import { ownerScope, validateCreate } from '@/lib/server/handwriting/service';
import { createSessionToken, requestReadSession } from '@/lib/flow/session-identity';

const original = { sourceRef: { pathId: 'local-path', frameId: 'local-frame', noteId: 'local-note', noteRevision: 'private-revision' },
  quote: '學而時習之，不亦說乎？', sourceLabel: '論語', chapterLabel: '學而', noteText: '這是我選擇的一條注腳。\r\n第二行。' };
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
async function input(owner = 'owner-a') {
  const draft = createReadingDraft(original); draft.styleCode = '12';
  const content = generationContent(draft);
  return { requestId: crypto.randomUUID(), contentDigest: await contentDigest(ownerScope(owner), content), content, consent: true };
}
test('draft preserves original quote and note; export content normalizes only transport line endings', () => {
  const draft = createReadingDraft(original); draft.styleCode = '12';
  expect(draft.quote).toBe(original.quote); expect(draft.signature).toBe('');
  expect(draft.noteText).toBe(original.noteText);
  const content = generationContent(draft);
  expect(content.text).toContain(original.quote);
  expect(content.text).toContain('這是我選擇的一條注腳。\n第二行。');
  expect(JSON.stringify(content)).not.toMatch(/local-path|local-note|private-revision/);
  for (const block of content.blocks) expect(content.text.slice(block.start, block.end).length).toBeGreaterThan(0);
});
test('only selected blocks enter the exact payload and draft editing does not edit the source', () => {
  const draft = createReadingDraft(original); draft.styleCode = '12';
  draft.included.note = false; draft.included.date = false; draft.included.source = false;
  expect(generationContent(draft).text).toBe(original.quote);
  draft.noteText = '只改紀念卡';
  expect(original.noteText).toContain('我選擇');
});
test('scope, signature, layout and exact text participate in cache identity', async () => {
  const draft = createReadingDraft(original); draft.styleCode = '12';
  const content = generationContent(draft), digest = await contentDigest('a', content);
  expect(await contentDigest('a', content)).toBe(digest);
  expect(await contentDigest('b', content)).not.toBe(digest);
  expect(await contentDigest('a', { ...content, layout: 'white' })).not.toBe(digest);
  expect(await contentDigest('a', { ...content, text: content.text + '。' })).not.toBe(digest);
  draft.signature = '測試落款'; draft.included.signature = true;
  expect(await contentDigest('a', generationContent(draft))).not.toBe(digest);
});
test('source revisions distinguish simultaneous edits without storing note plaintext', async () => {
  const first = await noteRevision({ updatedAt: 1, text: '自己的第一条理解' });
  const second = await noteRevision({ updatedAt: 1, text: '同一时刻的另一条理解' });
  expect(first).not.toBe(second);
  expect(first).not.toContain('自己的');
  expect(first).toMatch(/^1:[a-f0-9]{64}$/);
});
test('server checks exact digest and explicit consent and rejects local identifiers', async () => {
  const value = await input();
  expect(validateCreate('owner-a', value)).toEqual(value);
  expect(() => validateCreate('owner-b', value)).toThrow('草稿已变化');
  expect(() => validateCreate('owner-a', { ...value, consent: false })).toThrow('草稿格式');
  expect(() => validateCreate('owner-a', { ...value, noteId: 'private' })).toThrow('草稿格式');
  expect(() => validateCreate('owner-a', { ...value, content: { ...value.content, text: value.content.text + '改' } })).toThrow();
});
test('server rejects omitted text ranges and unknown renderer versions', async () => {
  const value = await input();
  expect(() => validateCreate('owner-a', { ...value, content: { ...value.content, blocks: value.content.blocks.slice(1) } })).toThrow();
  expect(() => validateCreate('owner-a', { ...value, content: { ...value.content, rendererVersion: 'future' } })).toThrow();
});
test('safe reads authenticate the existing cookie without Origin and reject other sites', () => {
  const token = createSessionToken();
  const headers = { Cookie: `infidao_flow=${token}`, 'Sec-Fetch-Site': 'same-origin' };
  expect(requestReadSession(new Request('http://localhost/api/handwriting/jobs/id', { headers }))).toBeTruthy();
  expect(() => requestReadSession(new Request('http://localhost/api/handwriting/jobs/id'))).toThrow();
  expect(() => requestReadSession(new Request('http://localhost/api/handwriting/jobs/id', { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } }))).toThrow();
});
