/** @jest-environment node */
import { poetryPassage, poetryWork, resetContentStore } from '@/lib/content/store';
import { contentCatalog, readPoetryManifest, verifyPoetryFiles } from '@/lib/content/registry';
import { openContentDatabase } from '@/lib/content/sqlite';
const { packJSON } = require('../../../shared/content/codec.cjs');
jest.mock('@/lib/content/registry', () => ({ contentCatalog: jest.fn(), readPoetryManifest: jest.fn(), verifyPoetryFiles: jest.fn(), contentRoot: () => '/test/data' }));
jest.mock('@/lib/content/sqlite', () => ({ openContentDatabase: jest.fn() }));

test('a corrupt active package cannot hide a verified archived work and passage', async () => {
  const id = '0'.repeat(32), revision = 'a'.repeat(24), passageId = `poetry-${id}-0`;
  const work = { id, revision, text: '山月', passages: [{ id: passageId, start: 0, end: 2 }] };
  const passage = { id: passageId, text: '山月', work: { workId: id, revision } };
  jest.mocked(contentCatalog).mockResolvedValue({ schemaVersion: 1, coreVersion: 'core', poetryManifests: ['current', 'archived'] });
  jest.mocked(readPoetryManifest).mockImplementation(async file => ({ version: file, shards: [{ path: file + '.sqlite' }] }) as any);
  jest.mocked(verifyPoetryFiles).mockImplementation(async manifest => { if (manifest.version === 'current') throw new Error('Checksum mismatch'); });
  jest.mocked(openContentDatabase).mockImplementation(() => ({ close: jest.fn(), prepare: (sql: string) => ({ get: () => sql.includes('meta') ? { value: 'poetry-ngram-v2:64:deflate-1' } : { json: packJSON(sql.includes('FROM works') ? work : passage) } }) }) as any);
  expect(await poetryWork(id, revision)).toEqual(work);
  expect(await poetryPassage(passageId, revision)).toEqual(passage);
  expect(openContentDatabase).toHaveBeenCalledTimes(1);
  expect(openContentDatabase).toHaveBeenCalledWith('/test/data/archived.sqlite');
  resetContentStore();
});
