/** @jest-environment node */
import { checkedQuote } from '@/lib/flow/candidates';
import { contentPackIdsSchema } from '@/lib/content/contracts';
import type { PassageRecord } from '@/types';
const text = '相思。\n相思。';
const poem: PassageRecord = { id: 'poetry-test', source: '复沓', collection: 'poetry', workId: 'work', workTitle: '复沓', chapter: '作者不详', section: 1, text, textHash: 'hash', corpusVersion: 'poetry:revision', work: { packId: 'poetry', workId: 'work', revision: 'revision', start: 0, end: text.length, title: '复沓', author: '作者不详', dynasty: '不详', genre: '诗' } };
test('repeated verse requires an explicit verified occurrence', () => {
  expect(() => checkedQuote(poem, '相思。')).toThrow();
  expect(checkedQuote(poem, '相思。',4)).toEqual({ quoteStart:4,quoteEnd:7 });
  expect(() => checkedQuote(poem,'相思。',3)).toThrow();
});
test('core identities and unique poetry quotations retain exact substring checks', () => {
  const { work: _work, ...core } = poem;
  expect(checkedQuote(core,'相思。')).toEqual({quoteStart:0,quoteEnd:3});
  expect(() => checkedQuote(poem,'思乡')).toThrow();
});
test('content ranges require core and reject duplicates and unknown packs', () => {
  expect(contentPackIdsSchema.parse(['poetry','core'])).toEqual(['poetry','core']);
  for (const ids of [[],['poetry'],['core','core'],['core','remote']]) expect(contentPackIdsSchema.safeParse(ids).success).toBe(false);
});
