/** @jest-environment node */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';

test('external base fonts retain every native glyph contour and source precedence', () => {
  const native = require('../../miniprogram/flow/glyph-outline');
  const browser = require('@/lib/flow-browser/glyph-outline');
  const base = path.join(process.cwd(), 'public', FLOW_RELEASE.fontBasePath);
  const manifest = JSON.parse(readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  const buffers = manifest.baseFonts.map((font: { file: string }) => new Uint8Array(readFileSync(path.join(base, font.file))).buffer);
  browser.installBaseFonts(buffers, manifest.baseCharacters);
  for (const character of Array.from(manifest.baseCharacters as string)) {
    expect(browser.hasGlyph(character)).toBe(true);
    expect(browser.glyphOutline(character)).toEqual(native.glyphOutline(character));
  }
  const coverage = new Set(Array.from(manifest.baseCharacters as string));
  const shard = manifest.shards.find((item: { characters: string }) => Array.from(item.characters).some(character => !coverage.has(character)));
  const character = Array.from(shard.characters as string).find(value => !coverage.has(value));
  const bytes = new Uint8Array(readFileSync(path.join(base, shard.file))).buffer;
  browser.installFont(shard.id, shard.characters, bytes);
  native.installFont(shard.id, shard.characters, bytes);
  expect(browser.glyphOutline(character)).toEqual(native.glyphOutline(character));
  expect(() => browser.glyphOutline('\uE000')).toThrow('Missing font glyph');
});
