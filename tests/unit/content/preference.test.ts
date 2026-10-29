import { currentContentPacks, matchesContentPreference, writeContentPreference } from '@/lib/flow-browser/content-preference';
import type { ContentScope } from '@/lib/content/contracts';
const scope = (packIds: ContentScope['packIds'], unavailable: string[] = []): ContentScope => ({packIds,unavailable,versions:{core:'v1'},fingerprint:'scope'});
afterEach(()=>{jest.restoreAllMocks();writeContentPreference(false);});
test('opt in persists and a downgraded chain still matches its requested range',()=>{
  writeContentPreference(true);
  expect(currentContentPacks()).toEqual(['core','poetry']);
  expect(matchesContentPreference(scope(['core'],['poetry']))).toBe(true);
  expect(matchesContentPreference(scope(['core']))).toBe(false);
  writeContentPreference(false);
  expect(matchesContentPreference(scope(['core'],['poetry']))).toBe(false);
  expect(matchesContentPreference(scope(['core']))).toBe(true);
});
test('denied persistence keeps the current-session setting usable',()=>{
  jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
  expect(writeContentPreference(true)).toBe(false);
  expect(currentContentPacks()).toEqual(['core','poetry']);
});
