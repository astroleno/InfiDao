/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file));
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const base = 'public' + FLOW_RELEASE.fontBasePath;
type Asset = { id: string; file: string; characters: string; bytes: number; sha256: string; family?: string };
type FontManifest = { schemaVersion: number; version: string; baseCharacters: string; baseFonts: Asset[]; shards: Asset[]; licenses: Asset[]; unsupported: string };

test('the release binds the verified assets, corpus manifest, and curated content', () => {
  const pinned = read(base + '/manifest.json');
  const manifest: FontManifest = JSON.parse(pinned.toString());
  expect(digest(pinned)).toBe(FLOW_RELEASE.fontManifestSha256);
  expect(createHash('sha256').update(read('src/lib/flow-browser/classic-display-projector.cjs'))
    .update(read('src/lib/flow-browser/classic-display.generated.json')).digest('hex')).toBe(FLOW_RELEASE.classicalDisplaySha256);
  const { manifestBytes } = require('../../scripts/web-flow-font-assets.cjs').createWebFontRelease(root);
  expect(pinned.equals(manifestBytes)).toBe(true);
  expect(manifest.version).toBe(FLOW_RELEASE.fontVersion);
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.baseFonts.map(({ family }) => family)).toEqual(['InfiDao WenKai TC']);
  expect(manifest.baseFonts.map(({ file }) => file)).toEqual(FLOW_RELEASE.fontPreloads);
  const faces = [...manifest.baseFonts, ...manifest.shards];
  for (const asset of [...faces, ...manifest.licenses]) {
    const bytes = read(base + '/' + asset.file);
    expect(bytes.byteLength).toBe(asset.bytes);
    expect(digest(bytes)).toBe(asset.sha256);
  }
  expect(pinned.byteLength + manifest.baseFonts[0]!.bytes).toBeLessThanOrEqual(96 * 1024);
  expect(Math.max(...faces.map(asset => asset.bytes))).toBeLessThanOrEqual(256 * 1024);
  expect(pinned.byteLength + [...faces, ...manifest.licenses].reduce((total, asset) => total + asset.bytes, 0)).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(manifest.licenses.map(({ file }) => file)).toContain('WenKaiTC-OFL.txt');
  expect(read(base + '/WenKaiTC-OFL.txt').toString()).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
  expect(JSON.parse(read('public/flow-assets/v-6dba935d9fdbbf4d92bb/manifest.json').toString()).version).toBe('6dba935d9fdbbf4d92bb');

  const corpus = JSON.parse(read('data/corpus-manifest.json').toString());
  const hash = createHash('sha256').update(read('data/corpus-manifest.json'));
  for (const file of corpus.files) hash.update(read(file.path));
  expect(hash.digest('hex')).toBe(FLOW_RELEASE.corpusSha256);
  expect(corpus.version).toBe(FLOW_RELEASE.corpusVersion);
  expect(require('../../shared/flow/curated-data').version).toBe(FLOW_RELEASE.curatedVersion);
  expect(JSON.parse(read('public/flow-releases/' + FLOW_RELEASE.id + '.json').toString())).toMatchObject(FLOW_RELEASE);
});

test('classical and rare glyphs use real Unicode outlines with disjoint downloadable coverage', () => {
  const manifest: FontManifest = JSON.parse(read(base + '/manifest.json').toString());
  const { createGlyphRuntime } = require('../../miniprogram/flow/glyph-core');
  const runtime = createGlyphRuntime();
  const baseBuffers = manifest.baseFonts.map(({ file }) => read(base + '/' + file));
  runtime.installBaseFonts(baseBuffers, manifest.baseCharacters);
  const coverage = new Set(Array.from(manifest.baseCharacters));
  for (const shard of manifest.shards) {
    for (const char of shard.characters) {
      expect(coverage.has(char)).toBe(false);
      coverage.add(char);
    }
    runtime.installFont(shard.id, shard.characters, read(base + '/' + shard.file));
  }
  for (const char of '知止而後有定能靜夢劇亂謂') {
    expect(manifest.baseCharacters).toContain(char);
    expect(runtime.glyphOutline(char).commands.length).toBeGreaterThan(0);
  }
  const rare = manifest.shards.find(({ id }) => !id.startsWith('wenkai-tc-'))!;
  expect(rare).toBeDefined();
  const char = Array.from(rare.characters).find(value => /\p{Script=Han}/u.test(value))!;
  expect(runtime.glyphOutline(char).commands.length).toBeGreaterThan(0);
  expect(manifest.unsupported).not.toContain(char);
});
