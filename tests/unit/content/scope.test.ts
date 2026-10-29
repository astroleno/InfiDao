/** @jest-environment node */
import { resolveContentScope } from '@/lib/content/scope';
import { activePoetryManifest } from '@/lib/content/store';
jest.mock('@/lib/content/store',()=>({activePoetryManifest:jest.fn()}));
const manifest=activePoetryManifest as jest.Mock;
afterEach(()=>jest.resetAllMocks());
test('core range never initializes poetry',async()=>{
  const scope=await resolveContentScope();
  expect(scope.packIds).toEqual(['core']);expect(manifest).not.toHaveBeenCalled();
});
test('scope is canonical regardless of order and changes when poetry version changes',async()=>{
  manifest.mockResolvedValue({version:'one'});
  const a=await resolveContentScope(['core','poetry']),b=await resolveContentScope(['poetry','core']);
  expect(a.fingerprint).toBe(b.fingerprint);
  manifest.mockResolvedValue({version:'two'});
  expect((await resolveContentScope(['core','poetry'])).fingerprint).not.toBe(a.fingerprint);
});
test('broken optional content is isolated without expanding core',async()=>{
  manifest.mockRejectedValue(new Error('corrupt shard'));
  const scope=await resolveContentScope(['core','poetry']);
  expect(scope.packIds).toEqual(['core']);expect(scope.unavailable).toEqual(['poetry']);
});
