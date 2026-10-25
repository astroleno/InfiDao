/** @jest-environment node */
import { CANDIDATE_EXCERPT_LIMIT, compactCandidates, familyDecisionGuidance, sourceExcerpt } from '@/lib/flow/context';
import type { PassageRecord } from '@/types';

const row = (id: string, source: string, text: string) => ({ id, source, text, chapter: id } as PassageRecord);

test('modern family choice guidance follows the reader question rather than classical family references', () => {
  expect(familyDecisionGuidance('家人总替我决定，怕说不就是不孝')).toContain('不能默认以放弃选择换和气');
  expect(familyDecisionGuidance('父母替我安排生活，我想自己选择')).toContain('不是现代人拥有个人选择的必要条件');
  expect(familyDecisionGuidance('舜为父亲承担什么代价')).toBe('');
  expect(familyDecisionGuidance('同事总替我决定工作分工')).toBe('');
  expect(familyDecisionGuidance('')).toBe('');
});

test('finds relevant text after the old prefix limit and retains source bytes', () => {
  const text = '旧章起首。'.repeat(700) + '君子以文会友，以友辅仁。' + '别章文字。'.repeat(500);
  const excerpt = sourceExcerpt(text, ['以友辅仁', '以文会友']);
  expect(excerpt).toContain('君子以文会友，以友辅仁。');
  expect(excerpt.length).toBeLessThanOrEqual(720);
  expect(text.includes(excerpt)).toBe(true);
});

test('a fixed quote and review target determine their own context', () => {
  const quote = '穆穆文王，于缉熙敬止。', text = '知止而后有定。'.repeat(600) + quote + '他章文字。'.repeat(500);
  const excerpt = sourceExcerpt(text, ['知止而后有定'], quote, 480);
  expect(excerpt).toContain(quote); expect(excerpt.length).toBeLessThanOrEqual(480);
  expect(text).toContain(excerpt);
});

test('a single classical concept still locates its actual occurrence beyond the prefix', () => {
  const text = '旧章起首。'.repeat(700) + '仁者爱人。' + '别章文字。'.repeat(500);
  const excerpt = sourceExcerpt(text, ['仁', '克己复礼']);
  expect(excerpt).toContain('仁者爱人。'); expect(excerpt.length).toBeLessThanOrEqual(720);
  expect(text).toContain(excerpt);
});

test('no excerpt splits a supplementary character or rewrites an attested spelling', () => {
  const text = '𠮷'.repeat(500) + '缗蛮黄鸟，止于丘隅。' + '𠮷'.repeat(500);
  const excerpt = sourceExcerpt(text, ['缗蛮黄鸟']);
  expect(excerpt).toContain('缗蛮黄鸟'); expect(excerpt).not.toContain('绵蛮黄鸟');
  expect(excerpt).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
  expect(text).toContain(excerpt);
});

test('shortlists at most twelve passages, retaining head, high ranks and book diversity', () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(`s${i}`, i < 25 ? '礼记' : `典籍${i}`, '起首。'.repeat(1000) + '仁者爱人。'));
  const head = { sourceId: 's39', quote: '仁者爱人。' }, result = compactCandidates(rows, ['仁者爱人'], head);
  expect(result.passages).toHaveLength(12); expect(result.passages[0]!.id).toBe('s39');
  expect(result.passages.some(passage => passage.id === 's0')).toBe(true);
  expect(new Set(result.passages.map(passage => passage.source)).size).toBeGreaterThan(5);
  expect(CANDIDATE_EXCERPT_LIMIT).toBe(480);
  expect(result.input.reduce((sum, passage) => sum + passage.text.length, 0)).toBeLessThanOrEqual(12 * 480);
  for (const input of result.input) expect(rows.find(passage => passage.id === input.sourceId)!.text).toContain(input.text);
});

test('omits reprinted read sentences before generation while retaining exact unread context', () => {
  const old = '知止而后有定，定而后能静。';
  const text = old + '君子素其位而行，不愿乎其外。安土敦乎仁，故能爱。';
  const result = compactCandidates([row('reprint', '礼记', text), row('only-old', '大学', old)], ['静', '素其位'], undefined, [old]);
  expect(result.passages.map(p => p.id)).toEqual(['reprint']);
  expect(result.input[0]!.text).toContain('君子素其位而行');
  expect(result.input[0]!.text).not.toContain('知止');
  expect(text).toContain(result.input[0]!.text);
});

test('a quoted spelling is omitted without changing a new stanza or a fixed head', () => {
  const old = '缗蛮黄鸟，止于丘隅。', other = '绵蛮黄鸟，止于丘阿。';
  const text = '诗云：绵蛮黄鸟，止于丘隅。' + other;
  expect(sourceExcerpt(text, ['黄鸟'], '', 720, [old])).toBe(other);
  expect(sourceExcerpt(text, ['黄鸟'], other, 720, [old])).toContain(other);
});
