const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTypography, FAMILY, SUPPLEMENT } = require('../flow/typography');
const { paintAtlas } = require('../flow/atlas');
const { createGlyphSource, glyphOutline } = require('../flow/glyph-outline');
const opentype = require('../flow/vendor/opentype');
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

test('only page fonts need registration; the optical scene reads the same font files', async () => {
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
  assert.deepEqual(await pending, { webview: 'loaded', canvas: 'font-file' });
});

test('failed font APIs do not block the scene or require native font fallback', async () => {
  const type = createTypography(), fake = host();
  const pending = type.prepare(fake.api);
  fake.calls[0].fail(); fake.calls[1].fail();
  assert.deepEqual(await pending, { webview: 'fallback', canvas: 'font-file' });
  const unavailable = createTypography();
  assert.deepEqual(await unavailable.prepare({}), { webview: 'fallback', canvas: 'font-file' });
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

test('Chinese font contours retain closed strokes and fit inside their atlas cells', () => {
  const { characters } = require('../assets/fonts/manifest');
  for (const char of characters) {
    if (!/[\u3400-\u9fff]/.test(char)) continue;
    const glyph = glyphOutline(char);
    assert.ok(glyph.commands.some(command => command.type === 'Z'), `Unclosed glyph ${char}`);
    for (const command of glyph.commands) {
      for (const suffix of ['', '1', '2']) {
        if (command['x' + suffix] === undefined) continue;
        const x = 48 + (command['x' + suffix] - glyph.advance / 2) * 64 / glyph.units;
        const y = 48 + (glyph.baseline - command['y' + suffix]) * 64 / glyph.units;
        assert.ok(x >= 0 && x <= 96 && y >= 0 && y <= 96, `Clipped glyph ${char}`);
      }
    }
  }
  assert.throws(() => glyphOutline('🫧'), /Missing font glyph/);
});

test('new quotation characters use the existing font without a quotation rebuild', () => {
  const quoted = new Set(Object.values(passages).flatMap(p => Array.from(p.quote)));
  const quote = '三慥殀烝脩蹞';
  for (const char of quote) assert.equal(quoted.has(char), false, `${char} must be new to the optical scene`);
  let fills = 0;
  const ctx = { clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, fill() { fills++; },
    fillText() { throw new Error('iPhone font fallback'); },
  };
  const atlas = paintAtlas({ getContext: () => ctx }, [{ quote }], 2);
  assert.equal(Object.keys(atlas).length, 6);
  assert.equal(fills, 6);
  assert.equal(glyphOutline('三').units, 256, 'the primary font is used first');
  assert.equal(glyphOutline('慥').units, 1000, 'missing Kangxi characters use the actual supplement font');
});

test('font files and glyphs are decoded once and reused across atlas rebuilds', () => {
  let reads = 0;
  const source = createGlyphSource([() => { reads++; return require('../assets/fonts/serif-data'); }]);
  const first = source('三');
  assert.equal(source('三'), first);
  assert.ok(source('心').commands.length > 0);
  assert.equal(reads, 1);
});

test('a new font buffer supplies unseen characters without any pre-exported outline or manifest', () => {
  const path = new opentype.Path();
  path.moveTo(0, 0); path.lineTo(200, 500); path.lineTo(400, 0); path.close();
  const font = new opentype.Font({ familyName: 'RuntimeFixture', styleName: 'Regular',
    unitsPerEm: 1000, ascender: 800, descender: -200,
    glyphs: [new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() }),
      new opentype.Glyph({ name: 'dynamic', unicode: '龘'.codePointAt(0), advanceWidth: 500, path })],
  });
  const buffer = font.toArrayBuffer();
  for (const data of [buffer, new Uint8Array(buffer), Buffer.from(buffer).toString('base64')]) {
    const source = createGlyphSource([data]);
    const glyph = source('龘');
    assert.equal(glyph.advance, 500);
    assert.ok(glyph.commands.some(p => p.x === 200 && p.y === 500));
    assert.throws(() => source('🫧'), /Missing font glyph/);
  }
});
