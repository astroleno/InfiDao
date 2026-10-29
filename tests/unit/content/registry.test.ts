/** @jest-environment node */
import { poetryManifestSchema } from '@/lib/content/registry';
test('manifest rejects unsafe locations, wrong models and inconsistent inventory', () => {
  const shards = Array.from({length:16},(_,i)=>({path:`poetry/v1/shard-${i.toString(16)}.sqlite`,sha256:'a'.repeat(64),bytes:4096,works:1,passages:1}));
  const manifest={schemaVersion:1,packId:'poetry',version:'poetry-'+ 'a'.repeat(16),indexModel:'poetry-ngram-v2',dimension:64,repository:'palemoky/chinese-poetry',commit:'b'.repeat(40),license:'MIT',works:16,passages:16,shards};
  expect(poetryManifestSchema.safeParse(manifest).success).toBe(true);
  expect(poetryManifestSchema.safeParse({...manifest,dimension:128}).success).toBe(false);
  expect(poetryManifestSchema.safeParse({...manifest,works:17}).success).toBe(false);
  expect(poetryManifestSchema.safeParse({...manifest,shards:[{...shards[0],path:'../private.sqlite'},...shards.slice(1)]}).success).toBe(false);
});
