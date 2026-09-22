const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTypography, FAMILY, SUPPLEMENT } = require('../flow/typography');
const { paintAtlas } = require('../flow/atlas');
const { glyphOutline } = require('../flow/glyph-outline');
const { createMockProvider } = require('../flow/provider');
const { readingLines } = require('../flow/scene');
const { passages, journeys } = require('../content/passages');

function host() {
  const calls = [];
  return {
    calls,
    api: {
      loadFontFace(options) { calls.push(options); },
    },
  };
}

test('bundled font covers all mock quotations, sources, interpretations and interface copy', () => {
  const manifest = require('../assets/fonts/manifest');
  const supported = new Set(manifest.characters);
  const content = JSON.stringify({ passages, journeys });
  const page = fs.readFileSync(path.resolve(__dirname, '../pages/flow/index.wxml'), 'utf8');
  for (const char of content + page) {
    if (/[^\x00-\x7f\s]/.test(char)) assert.ok(supported.has(char), `Missing ${char}`);
  }
  const font = Buffer.from(require('../assets/fonts/serif-data'), 'base64');
  const supplement = Buffer.from(require('../assets/fonts/supplement-data'), 'base64');
  assert.equal(font.toString('ascii', 0, 4), 'wOFF');
  assert.equal(supplement.toString('ascii', 0, 4), 'wOFF');
  assert.ok(font.length + supplement.length < 300 * 1024, 'the subsets must fit the offline first-screen budget');
});

test('only page fonts need registration; the optical scene uses bundled outlines', async () => {
  const type = createTypography(), fake = host();
  const pending = type.prepare(fake.api);
  assert.equal(pending, type.prepare(fake.api));
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(fake.calls.map(call => call.scopes), [['webview'], ['webview']]);
  assert.deepEqual(fake.calls.map(call => call.family), [FAMILY, SUPPLEMENT]);
  for (const call of fake.calls) {
    assert.match(call.source, /^url\("data:font\/woff;base64,/);
    call.success();
  }
  assert.deepEqual(await pending, { webview: 'loaded', canvas: 'bundled-outlines' });
});

test('failed font APIs do not block the scene or require native font fallback', async () => {
  const type = createTypography(), fake = host();
  const pending = type.prepare(fake.api);
  fake.calls[0].fail(); fake.calls[1].fail();
  assert.deepEqual(await pending, { webview: 'fallback', canvas: 'bundled-outlines' });
  const unavailable = createTypography();
  assert.deepEqual(await unavailable.prepare({}), { webview: 'fallback', canvas: 'bundled-outlines' });
});

test('all three journeys paint the chosen font without reading font-family or calling fillText', async () => {
  for (const seed of ['心很乱', '与他人相处', '开始学习']) {
    const frames = readingLines((await createMockProvider().open(seed)).frames);
    for (const dpr of [1, 2]) {
      let fills = 0, saved = 0, paths = 0;
      const ctx = {
        clearRect() {}, save() { saved++; }, restore() { saved--; }, translate() {}, scale() {},
        beginPath() { paths++; }, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {},
        fill() { fills++; }, fillText() { throw new Error('iPhone system font would be used'); },
        set font(_) { throw new Error('Font family must never affect the flowing scene'); },
      };
      const canvas = { getContext: () => ctx };
      const glyphs = paintAtlas(canvas, frames, dpr);
      const expected = new Set(frames.flatMap(frame => Array.from(frame.quote)));
      assert.deepEqual(new Set(Object.keys(glyphs)), expected);
      assert.equal(fills, expected.size);
      assert.equal(paths, expected.size);
      assert.equal(saved, 0);
      assert.equal(canvas.width, 1024 * dpr);
    }
  }
});

test('bundled glyph contours retain closed strokes and fit inside their atlas cells', () => {
  for (const char of Object.keys(require('../assets/fonts/flow-outlines'))) {
    const glyph = glyphOutline(char);
    assert.ok(glyph.commands.some(command => command[0] === 4), `Unclosed glyph ${char}`);
    for (const command of glyph.commands) {
      for (let i = 1; i < command.length; i += 2) {
        const x = 48 + (command[i] - glyph.advance / 2) * 64 / 4096;
        const y = 48 + (glyph.baseline - command[i + 1]) * 64 / 4096;
        assert.ok(x >= 0 && x <= 96 && y >= 0 && y <= 96, `Clipped glyph ${char}`);
      }
    }
  }
  assert.throws(() => glyphOutline('🫧'), /Missing bundled flow glyph/);
});
