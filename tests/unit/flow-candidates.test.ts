/** @jest-environment node */
import { candidatesFor, flowCorpus } from '@/lib/flow/candidates';
import { lexicalBreaks } from '@/lib/flow/lexemes';
import { FLOW_PROMPT_VERSION } from '@/lib/flow/contracts';
import type { SemanticEntry } from '@/lib/flow/semantic-index';

jest.mock('@/lib/flow/lexemes', () => {
  const actual = jest.requireActual('@/lib/flow/lexemes');
  return { ...actual, lexicalBreaks: jest.fn(actual.lexicalBreaks) };
});

jest.mock('@/lib/data/corpus', () => ({ loadCorpus: jest.fn(async () => [
  { id: 'row-a', text: '物有本末，事有终始。', textHash: 'hash-a', corpusVersion: 'v1', source: '大学', workTitle: '大学', chapter: '经一章' },
  { id: 'row-b', text: '己所不欲，勿施于人。', textHash: 'hash-b', corpusVersion: 'v1', source: '论语', workTitle: '论语', chapter: '颜渊' },
]) }));

const entry: SemanticEntry = { id: 'row-a', textHash: 'hash-a', corpusVersion: 'v1', promptVersion: FLOW_PROMPT_VERSION,
  text: '独特标记', updated: 1 };

test('retrieval keeps canonical source text without segmenting every passage', async () => {
  const rows = await flowCorpus();
  expect(lexicalBreaks).not.toHaveBeenCalled();
  expect(rows[0]).not.toHaveProperty('lexicalBreaks');
  expect(JSON.parse(JSON.stringify(rows[0])).text).toBe('物有本末，事有终始。');
  await candidatesFor(['物有本末'], '先后', new Set());
  expect(lexicalBreaks).not.toHaveBeenCalled();
});

test('semantic retrieval uses only supplied visitor entries with current source identity', async () => {
  const retrieve = (entries: SemanticEntry[]) => candidatesFor(['独特标记'], '', new Set(), undefined, entries);
  expect(await retrieve([])).toEqual([]);
  expect((await retrieve([entry])).map(row => row.id)).toEqual(['row-a']);
  for (const invalid of [{ ...entry, textHash: 'old' }, { ...entry, corpusVersion: 'old' }, { ...entry, promptVersion: 'old' }, { ...entry, id: 'missing' }]) {
    expect(await retrieve([invalid])).toEqual([]);
  }
  expect(await retrieve([])).toEqual([]);
  expect(await candidatesFor(['独特标记'], '', new Set(['row-a']), undefined, [entry])).toEqual([]);
  expect((await candidatesFor([], '', new Set(['row-a']), 'row-a')).map(row => row.id)).toEqual(['row-a']);
});
