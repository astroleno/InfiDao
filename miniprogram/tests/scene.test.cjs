const test = require('node:test');
const assert = require('node:assert/strict');
const { sceneMetrics, focusAt, wheelGeometry, readingLines } = require('../flow/scene');
const { paintAtlas } = require('../flow/atlas');
const { createMockProvider } = require('../flow/provider');

test('the glass volume has a single upright axis and level end planes at different phone sizes', () => {
  for (const [width, height] of [[320, 408], [390, 652], [430, 748]]) {
    const { radius, pitch } = sceneMetrics(width, height);
    const geometry = wheelGeometry(radius, pitch);
    const top = [], bottom = [];
    for (let i = 0; i < geometry.length; i += 8) {
      const [x,y,z,nx,ny,nz] = geometry.slice(i, i + 6);
      assert.ok(Math.abs(Math.abs(y) - pitch * 2.5) < 1e-8);
      if (ny === 0) {
        assert.ok(Math.abs(Math.hypot(x,z) - radius) < 1e-8);
        assert.ok(x * nx + z * nz > 0);
      }
      (y > 0 ? top : bottom).push([x,z]);
    }
    for (const plane of [top, bottom]) {
      assert.ok(Math.abs(plane.reduce((sum,p) => sum + p[0], 0) / plane.length) < 1e-8);
      assert.ok(Math.abs(plane.reduce((sum,p) => sum + p[1], 0) / plane.length) < 1e-8);
    }
  }
});

test('focus is symmetric, centered, and decreases towards both ends of the five bands', () => {
  const center = focusAt(0, 100), near = focusAt(100, 100), far = focusAt(200, 100);
  assert.equal(center.focus, 1);
  assert.equal(center.opacity, 1);
  assert.ok(center.opacity > near.opacity && near.opacity > far.opacity);
  assert.ok(center.focus > near.focus && near.focus > far.focus);
  assert.deepEqual(near, focusAt(-100, 100));
  assert.deepEqual(far, focusAt(-200, 100));
});

test('the moving scene contains only short quotations, while source and reflection remain available on demand', async () => {
  const session = await createMockProvider().open('我想让心慢下来');
  const lines = readingLines(session.frames);
  assert.ok(lines.length > session.frames.length);
  assert.equal(new Set(lines.map(line => line.id)).size, lines.length);
  assert.ok(lines.every(line => line.quote.length <= 10));
  assert.ok(lines.every(line => line.fullText.includes(line.quote) && line.sourceId && line.reflection));
  const drawn = [];
  const canvas = { getContext: () => ({ clearRect() {}, fillText(text) { drawn.push(text); } }) };
  paintAtlas(canvas, lines);
  assert.deepEqual(new Set(drawn), new Set(lines.flatMap(line => Array.from(line.quote))));
  assert.ok(drawn.every(text => Array.from(text).length === 1));
});
