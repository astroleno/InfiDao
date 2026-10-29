import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoetryManifest } from './contracts';

const shardSchema = z.object({ path: z.string().regex(/^poetry\/[a-zA-Z0-9_-]+\/shard-[a-f0-9]\.sqlite$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(), works: z.number().int().nonnegative(), passages: z.number().int().nonnegative() });
export const poetryManifestSchema = z.object({ schemaVersion: z.literal(1), packId: z.literal('poetry'), version: z.string().regex(/^poetry-[a-f0-9]{16}$/),
  indexModel: z.literal('poetry-ngram-v2'), dimension: z.literal(64), repository: z.literal('palemoky/chinese-poetry'), commit: z.string().regex(/^[a-f0-9]{40}$/),
  license: z.literal('MIT'), works: z.number().int().positive(), passages: z.number().int().positive(), shards: z.array(shardSchema).length(16),
}).superRefine((value, ctx) => {
  if (new Set(value.shards.map(s => s.path)).size !== 16 || value.shards.reduce((n, s) => n + s.works, 0) !== value.works || value.shards.reduce((n, s) => n + s.passages, 0) !== value.passages) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent shard inventory' });
});
const catalogSchema = z.object({ schemaVersion: z.literal(1), coreVersion: z.string().min(1), poetryManifests: z.array(z.string().regex(/^poetry\/[a-zA-Z0-9_-]+\/manifest\.json$/)).min(1).max(16) });
export const contentRoot = () => path.join(process.cwd(), 'data');
export async function contentCatalog() {
  return catalogSchema.parse(JSON.parse(await fs.readFile(path.join(contentRoot(), 'content-packs/manifest.json'), 'utf8')));
}
export async function readPoetryManifest(file: string): Promise<PoetryManifest> {
  if (!/^poetry\/[a-zA-Z0-9_-]+\/manifest\.json$/.test(file)) throw new Error('Unknown content manifest');
  return poetryManifestSchema.parse(JSON.parse(await fs.readFile(path.join(contentRoot(), file), 'utf8')));
}
const validations = new Map<string, Promise<void>>();
export async function verifyPoetryFiles(manifest: PoetryManifest) {
  const key = manifest.version;
  let pending = validations.get(key);
  if (!pending) {
    pending = (async () => {
      for (const shard of manifest.shards) {
        const file = path.join(contentRoot(), shard.path);
        if ((await fs.stat(file)).size !== shard.bytes) throw new Error('Content shard size differs');
        const hash = createHash('sha256');
        for await (const bytes of createReadStream(file)) hash.update(bytes);
        if (hash.digest('hex') !== shard.sha256) throw new Error('Content shard checksum differs');
      }
    })();
    validations.set(key, pending);
    pending.catch(() => { validations.delete(key); });
  }
  return pending;
}
export async function listContentPacks() {
  const core = { id: 'core', title: '核心典籍', required: true, available: true, works: 14, version: 'guji-core-v1', description: '经书、左传与墨荀韩非' };
  try {
    const catalog = await contentCatalog();
    const manifest = await readPoetryManifest(catalog.poetryManifests[0]!);
    // Do not hash or initialize a disabled package merely to draw a menu.
    for (const file of manifest.shards) if ((await fs.stat(path.join(contentRoot(), file.path))).size !== file.bytes) throw new Error('Content shard missing');
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major! < 22 || (major === 22 && minor! < 13)) throw new Error('Optional index needs Node 22.13+');
    return [core, { id: 'poetry', title: '诗词篇', required: false, available: true, works: manifest.works, version: manifest.version, description: '唐宋诗词、五代词、元曲与楚辞', source: `https://github.com/${manifest.repository}/tree/${manifest.commit}`, license: manifest.license }];
  } catch {
    return [core, { id: 'poetry', title: '诗词篇', required: false, available: false, works: 0, version: '', description: '诗词内容暂不可用，核心典籍仍可阅读' }];
  }
}
