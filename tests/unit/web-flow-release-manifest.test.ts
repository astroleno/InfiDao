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
  expect(manifest.baseFonts[0].sha256).toBe('1366af1c5bc671f86f5dd7b57507fa30b8a4068ec99719c90542cf8e8609eb18');
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

test('the reviewed simplified codepoints use corrected outlines and keep legacy coverage', () => {
  const base = 'public' + FLOW_RELEASE.fontBasePath;
  const manifest = JSON.parse(read(base + '/manifest.json').toString());
  const previous = JSON.parse(read('public/flow-assets/v-094d7b612c674ac324e9/manifest.json').toString());
  const coverage = ({ baseCharacters, shards }: typeof manifest) => new Set([
    ...Array.from(baseCharacters), ...shards.flatMap(({ characters }: { characters: string }) => Array.from(characters)),
  ]);
  expect(coverage(manifest)).toEqual(coverage(previous));

  const { createGlyphRuntime, createGlyphSource } = require('../../miniprogram/flow/glyph-core');
  const runtime = createGlyphRuntime();
  const baseBuffers = manifest.baseFonts.map(({ file }: { file: string }) => read(base + '/' + file));
  const opentype = require('../../miniprogram/flow/vendor/opentype');
  const correctionCmap = opentype.parse(Uint8Array.from(baseBuffers[0]).buffer, { lowMemory: true }).tables.cmap.glyphIndexMap;
  expect(Object.keys(correctionCmap).map(cp => String.fromCodePoint(Number(cp))).sort()).toEqual(Array.from('静剧谓虑乐终').sort());
  expect(manifest.baseFonts[0].characters).toBe('静剧谓虑乐终');
  const legacy = createGlyphSource(baseBuffers.slice(1));
  const correction = createGlyphSource(baseBuffers.slice(0, 1));
  runtime.installBaseFonts(baseBuffers, manifest.baseCharacters);
  for (const shard of manifest.shards) runtime.installFont(shard.id, shard.characters, read(base + '/' + shard.file));

  for (const [char, traditional] of Object.entries({ 静: '靜', 剧: '劇', 谓: '謂', 虑: '慮', 乐: '樂', 终: '終' })) {
    expect(manifest.baseCharacters).toContain(char);
    expect(manifest.shards.some(({ characters }: { characters: string }) => characters.includes(char))).toBe(false);
    const originalAsset = previous.shards.find(({ characters }: { characters: string }) => characters.includes(char));
    const previousOutline = previous.baseCharacters.includes(char) ? legacy :
      createGlyphSource([read('public/flow-assets/v-094d7b612c674ac324e9/' + originalAsset.file)]);
    expect(runtime.glyphOutline(char)).toEqual(correction(char));
    expect(runtime.glyphOutline(char).commands).not.toEqual(previousOutline(char).commands);
    expect(runtime.glyphOutline(char).commands).not.toEqual(runtime.glyphOutline(traditional).commands);
  }
  for (const char of '后乱梦不以知之') {
    expect(() => correction(char)).toThrow('Missing font glyph');
    const originalAsset = previous.shards.find(({ characters }: { characters: string }) => characters.includes(char));
    const previousOutline = previous.baseCharacters.includes(char) ? legacy :
      createGlyphSource([read('public/flow-assets/v-094d7b612c674ac324e9/' + originalAsset.file)]);
    expect(runtime.glyphOutline(char)).toEqual(previousOutline(char));
  }
  for (const char of coverage(manifest)) runtime.glyphOutline(char);
});
