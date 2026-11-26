/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';
const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file));
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');

test('the release binds the exact verified font shards, corpus manifest, and curated content', () => {
  const base = 'public' + FLOW_RELEASE.fontBasePath;
  const original = read('public/flow-fonts/manifest.json'), pinned = read(base + '/manifest.json');
  expect(digest(pinned)).toBe(FLOW_RELEASE.fontManifestSha256);
  const { manifestBytes } = require('../../scripts/web-flow-font-assets.cjs').createWebFontRelease(root);
  expect(pinned.equals(manifestBytes)).toBe(true);
  const manifest = JSON.parse(pinned.toString());
  expect(manifest.version).toBe(FLOW_RELEASE.fontVersion);
  expect(manifest.originalVersion).toBe(JSON.parse(original.toString()).version);
  expect(manifest.baseFonts.map(({ family }: { family: string }) => family)).toEqual([
    'InfiDaoWebSerifSC', 'RunZhiJiaKangXiZidian', 'InfiDaoSerifSupplement',
  ]);
  for (const shard of [...manifest.baseFonts, ...manifest.shards]) {
    const bytes = read(base + '/' + shard.file);
    expect(bytes.byteLength).toBe(shard.bytes);
    expect(digest(bytes)).toBe(shard.sha256);
  }
  for (const [index, name] of ['serif', 'supplement'].entries()) {
    expect(read(base + '/' + manifest.baseFonts[index + 1].file).equals(Buffer.from(require(`../../miniprogram/assets/fonts/${name}-data`), 'base64'))).toBe(true);
  }
  const corpus = JSON.parse(read('data/corpus-manifest.json').toString());
  const hash = createHash('sha256').update(read('data/corpus-manifest.json'));
  for (const file of corpus.files) hash.update(read(file.path));
  expect(hash.digest('hex')).toBe(FLOW_RELEASE.corpusSha256);
  expect(corpus.version).toBe(FLOW_RELEASE.corpusVersion);
  expect(require('../../shared/flow/curated-data').version).toBe(FLOW_RELEASE.curatedVersion);
  expect(JSON.parse(read('public/flow-releases/' + FLOW_RELEASE.id + '.json').toString())).toMatchObject(FLOW_RELEASE);
});

test('simplified codepoints use corrected outlines through the Web glyph registry', () => {
  const base = 'public' + FLOW_RELEASE.fontBasePath;
  const manifest = JSON.parse(read(base + '/manifest.json').toString());
  const { createGlyphRuntime, createGlyphSource } = require('../../miniprogram/flow/glyph-core');
  const runtime = createGlyphRuntime();
  const baseBuffers = manifest.baseFonts.map(({ file }: { file: string }) => read(base + '/' + file));
  const legacy = createGlyphSource(baseBuffers.slice(1));
  runtime.installBaseFonts(baseBuffers, manifest.baseCharacters);
  for (const shard of manifest.shards) runtime.installFont(shard.id, shard.characters, read(base + '/' + shard.file));

  for (const char of '谓静') {
    expect(runtime.glyphOutline(char)).toEqual(createGlyphSource(baseBuffers.slice(0, 1))(char));
    expect(runtime.glyphOutline(char).commands).not.toEqual(legacy(char).commands);
  }
  const revised = manifest.shards.filter(({ characters }: { characters: string }) => characters.includes('剧'));
  expect(revised).toHaveLength(1);
  expect(revised[0].id).toMatch(/^serif-sc-/);
  expect(runtime.glyphOutline('剧')).toEqual(createGlyphSource([read(base + '/' + revised[0].file)])('剧'));
  // The explicit traditional codepoint still resolves to its historical shard.
  const traditional = manifest.shards.find(({ characters }: { characters: string }) => characters.includes('劇'));
  const original = JSON.parse(read('public/flow-fonts/manifest.json').toString()).shards.find(
    ({ characters }: { characters: string }) => characters.includes('劇'));
  expect(traditional.sha256).toBe(original.sha256);
  expect(runtime.glyphOutline('剧').commands).not.toEqual(runtime.glyphOutline('劇').commands);
});
