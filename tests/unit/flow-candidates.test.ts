/** @jest-environment node */
import { candidatesFor } from '@/lib/flow/candidates';
import { FLOW_PROMPT_VERSION } from '@/lib/flow/contracts';
import type { SemanticEntry } from '@/lib/flow/semantic-index';

jest.mock('@/lib/data/corpus', () => ({ loadCorpus: jest.fn(async () => [
  { id: 'row-a', text: '物有本末，事有终始。', textHash: 'hash-a', corpusVersion: 'v1', source: '大学', workTitle: '大学', chapter: '经一章' },
  { id: 'row-b', text: '己所不欲，勿施于人。', textHash: 'hash-b', corpusVersion: 'v1', source: '论语', workTitle: '论语', chapter: '颜渊' },
]) }));

const entry: SemanticEntry = { id: 'row-a', textHash: 'hash-a', corpusVersion: 'v1', promptVersion: FLOW_PROMPT_VERSION,
  text: '独特标记', updated: 1 };

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
