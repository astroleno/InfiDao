const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTypography, FAMILY, SUPPLEMENT, FALLBACK } = require('../flow/typography');
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

test('page and native glyphs load from the same bundled font before drawing, with no CDN', async () => {
  const type = createTypography(), fake = host();
  const pending = type.prepare(fake.api);
  assert.equal(pending, type.prepare(fake.api));
  assert.equal(fake.calls.length, 4);
  assert.deepEqual(fake.calls.map(call => call.scopes), [['webview'], ['webview'], ['native'], ['native']]);
  assert.deepEqual(fake.calls.map(call => call.family), [FAMILY, SUPPLEMENT, FAMILY, SUPPLEMENT]);
  for (const call of fake.calls) {
    assert.match(call.source, /^url\("data:font\/woff;base64,/);
    call.success();
  }
  assert.deepEqual(await pending, { webview: 'loaded', native: 'loaded' });
  assert.equal(type.canvasFamily(), FAMILY);
  assert.equal(type.canvasFamily('心'), FAMILY);
  for (const char of '慥殀烝脩蹞') assert.equal(type.canvasFamily(char), SUPPLEMENT);
});

test('a failed native font does not discard the page font or block opening', async () => {
  const type = createTypography(), fake = host();
  const pending = type.prepare(fake.api);
  fake.calls[0].success(); fake.calls[1].success();
  fake.calls[2].fail(); fake.calls[3].fail();
  assert.deepEqual(await pending, { webview: 'loaded', native: 'fallback' });
  assert.equal(type.canvasFamily(), FALLBACK);
  const unavailable = createTypography();
  assert.deepEqual(await unavailable.prepare({}), { webview: 'fallback', native: 'fallback' });
});
