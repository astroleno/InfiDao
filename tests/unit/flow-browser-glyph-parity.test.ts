/** @jest-environment node */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';

type Face = { file: string; characters?: string };
type Shard = { id: string; file: string; characters: string };
type Manifest = { baseCharacters: string; baseFonts: Face[]; shards: Shard[] };

function fontRelease(basePath: string) {
  const directory = path.join(process.cwd(), 'public', basePath);
  const read = (file: string) => readFileSync(path.join(directory, file));
  const manifest: Manifest = JSON.parse(read('manifest.json').toString('utf8'));
  return { manifest, read };
}

test('historical Web faces keep the original native contours outside the reviewed SC correction', () => {
  jest.isolateModules(() => {
    const native = require('../../miniprogram/flow/glyph-outline');
    const browser = require('@/lib/flow-browser/glyph-outline');
    const { manifest, read } = fontRelease('/flow-assets/v-6dba935d9fdbbf4d92bb');
    const corrected = new Set(manifest.baseFonts[0]!.characters);
    const buffers = manifest.baseFonts.map(font => new Uint8Array(read(font.file)).buffer);
    browser.installBaseFonts(buffers, manifest.baseCharacters);

    for (const character of manifest.baseCharacters) {
      expect(browser.hasGlyph(character)).toBe(true);
      if (!corrected.has(character)) expect(browser.glyphOutline(character)).toEqual(native.glyphOutline(character));
    }

    const shard = manifest.shards.find(item => item.characters.includes('王'))!;
    expect(native.hasGlyph('王')).toBe(false);
    expect(browser.hasGlyph('王')).toBe(false);
    const bytes = new Uint8Array(read(shard.file)).buffer;
    browser.installFont(shard.id, shard.characters, bytes);
    native.installFont(shard.id, shard.characters, bytes);
    const outline = browser.glyphOutline('王');
    expect(outline.commands.length).toBeGreaterThan(0);
    expect(outline).toEqual(native.glyphOutline('王'));
    expect(() => browser.glyphOutline('\uE000')).toThrow('Missing font glyph');
  });
});

test('current WenKai assets decode to the same real base and shard contours in both runtimes', () => {
  jest.isolateModules(() => {
    const { createGlyphRuntime } = require('../../miniprogram/flow/glyph-core');
    const native = createGlyphRuntime();
    const browser = require('@/lib/flow-browser/glyph-outline');
    const { manifest, read } = fontRelease(FLOW_RELEASE.fontBasePath);
    const base = manifest.baseFonts.map(font => read(font.file));

    native.installBaseFonts(base, manifest.baseCharacters);
    browser.installBaseFonts(base.map(bytes => new Uint8Array(bytes).buffer), manifest.baseCharacters);
    for (const character of manifest.baseCharacters) expect(browser.hasGlyph(character)).toBe(true);

    const opening = browser.glyphOutline('靜');
    expect(opening.commands.length).toBeGreaterThan(0);
    expect(opening).toEqual(native.glyphOutline('靜'));

    for (const [character, faceId] of [['孫', /^wenkai-tc-[a-f0-9]+$/], ['滺', /^wenkai-[a-f0-9]+$/]] as const) {
      const shard = manifest.shards.find(item => item.characters.includes(character))!;
      expect(shard.id).toMatch(faceId);
      expect(native.hasGlyph(character)).toBe(false);
      expect(browser.hasGlyph(character)).toBe(false);
      const bytes = read(shard.file);
      native.installFont(shard.id, shard.characters, bytes);
      browser.installFont(shard.id, shard.characters, new Uint8Array(bytes).buffer);
      expect(browser.hasGlyph(character)).toBe(true);
      const outline = browser.glyphOutline(character);
      expect(outline.commands.length).toBeGreaterThan(0);
      expect(outline).toEqual(native.glyphOutline(character));
    }
    expect(() => browser.glyphOutline('\uE000')).toThrow('Missing font glyph');
    expect(() => native.glyphOutline('\uE000')).toThrow('Missing font glyph');
  });
});
