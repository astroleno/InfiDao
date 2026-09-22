const test = require('node:test');
const assert = require('node:assert/strict');
const { CENTER_SCALE, rowMotion, sceneMetrics, focusAt, wheelGeometry, quotationGeometry, readingLines, projectedRows } = require('../flow/scene');
const { FlowTimeline, CELL, CENTER_PHASE } = require('../flow/timeline');
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

test('front quotations cross every phase without an empty middle or clipped glyphs, including wide canvases', () => {
  for (const [width, height] of [[320, 408], [390, 725], [430, 748], [768, 899], [1024, 631], [844, 271]]) {
    const metrics = sceneMetrics(width, height);
    assert.ok(Number.isFinite(metrics.scrollPitch) && metrics.scrollPitch > 0);
    const frames = Array.from({ length: 8 }, (_, i) => ({ quote: ['道也者', '知止而后有定', '存其心，养其性', '一二三四五六七八九'][i % 4] }));
    const glyphs = Object.fromEntries(frames.flatMap(frame => Array.from(frame.quote)).map(char => [char, [0, 0, 1, 1]]));
    const vertices = quotationGeometry(frames, glyphs, metrics.radius, metrics.fontSize, height / 2);
    for (let offset = 0; offset < 10; offset++) for (let step = 0; step < 320; step++) {
      const rows = projectedRows(vertices, step / 40, frames.length, width, height, 0, offset).filter(row => Math.abs(row.distance) <= 0.501);
      assert.ok(rows.some(row => row.left < width / 2 && row.right > width / 2), `${width}: empty phase ${step / 40}`);
      for (const row of rows) assert.ok(row.left >= 0 && row.right <= width, `${width}: clipped phase ${step / 40}`);
    }
  }
});

test('neighbouring rows turn in opposite directions at different slow paces and face front when settled', () => {
  for (const offset of [0, 15, 30]) {
    const speeds = [];
    for (let index = 2; index < 7; index++) {
      const from = rowMotion(index, 4.2, 15, offset), to = rowMotion(index, 4.21, 15, offset);
      const speed = (to.angle - from.angle) / 0.01;
      assert.ok(Math.abs(speed) >= 0.139 && Math.abs(speed) <= 0.221);
      assert.equal(Math.abs(rowMotion(index, index, 15, offset).angle), 0);
      speeds.push(speed);
    }
    for (let i = 1; i < speeds.length; i++) {
      assert.ok(speeds[i] * speeds[i - 1] < 0);
      assert.ok(Math.abs(Math.abs(speeds[i]) - Math.abs(speeds[i - 1])) > 0.01);
    }
    assert.equal(new Set(speeds.map(speed => Math.abs(speed).toFixed(3))).size, 5);
  }
});

test('row direction and rotation stay continuous across odd and even loops, reverse scrubbing and background', () => {
  for (const count of [15, 16]) {
    const timeline = new FlowTimeline(count);
    timeline.position = count * CELL - 0.1;
    const motion = index => rowMotion(index, timeline.position / CELL - CENTER_PHASE, count, timeline.rowOffset);
    const before = [count - 1, 0, 1].map(motion);
    timeline.advancePosition(0.2);
    assert.equal(timeline.rowOffset, count);
    const after = [count - 1, 0, 1].map(motion);
    before.forEach((row, i) => {
      assert.equal(row.ordinal, after[i].ordinal);
      assert.equal(row.turn, after[i].turn);
      assert.ok(Math.abs(row.angle - after[i].angle) < 0.0001);
    });
    timeline.scrub(0.2, CELL);
    assert.equal(timeline.rowOffset, 0);
    assert.ok(Math.abs(motion(0).angle - before[1].angle) < 1e-10);
    timeline.setVisible(false);
    timeline.tick(0); timeline.tick(120000);
    assert.ok(Math.abs(motion(0).angle - before[1].angle) < 1e-10);
  }
});

test('long dynamic quotations split into bounded rows without losing their original context', () => {
  const quote = '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。';
  const frame = { id: 'dynamic', quote, fullText: quote };
  const rows = readingLines([frame]);
  assert.ok(rows.length > 1);
  assert.ok(rows.every(row => Array.from(row.quote).length <= 9 && row.passageQuote === quote && row.passageId === 'dynamic'));
  assert.equal(rows[0].passageLines.join(''), quote);
  const boundary = readingLines([{ id: 'boundary', quote: '一二三四五六七八九，知止而后有定。' }]);
  assert.ok(boundary.every(row => row.quote.length > 0));
  assert.equal(boundary[0].passageLines.join(''), '一二三四五六七八九，知止而后有定。');
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

test('magnified centered quotations keep every glyph inside narrow and wide phone screens', () => {
  for (const [width, height] of [[320, 408], [390, 725], [430, 748]]) {
    const { radius, fontSize } = sceneMetrics(width, height);
    const camera = height / 2;
    for (const quote of ['物有本末', '知止而后有定', '存其心，养其性', '一二三四五六七八九十']) {
      const glyphs = Object.fromEntries(Array.from(quote).map(char => [char, [0, 0, 1, 1]]));
      const vertices = quotationGeometry([{ quote }], glyphs, radius, fontSize, camera);
      // First copy is the front-facing quotation when this row is centered.
      for (let char = 0; char < quote.length; char++) {
        for (let corner = 0; corner < 6; corner++) {
          const offset = (char * 30 + corner) * 8;
          const [angle, tangent] = vertices.slice(offset, offset + 2);
          const x = (Math.sin(angle) * (radius + 0.8) + Math.cos(angle) * tangent) * CENTER_SCALE;
          const z = Math.cos(angle) * (radius + 0.8) - Math.sin(angle) * tangent;
          assert.ok(Math.abs(x * camera / (camera - z)) < width / 2, `${width}px: ${quote}`);
        }
      }
    }
  }
});

test('the moving scene contains only short quotations, while source and reflection remain available on demand', async () => {
  const session = await createMockProvider().open('我想让心慢下来');
  const lines = readingLines(session.frames);
  assert.ok(lines.length > session.frames.length);
  assert.equal(new Set(lines.map(line => line.id)).size, lines.length);
  assert.ok(lines.every(line => line.quote.length <= 10));
  assert.ok(lines.every(line => line.fullText.includes(line.quote) && line.sourceId && line.reflection));
  let drawn = 0;
  const ctx = { clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, fill() { drawn++; },
    fillText() { throw new Error('Native font fallback must not be used'); },
  };
  const canvas = { getContext: () => ctx };
  const glyphs = paintAtlas(canvas, lines);
  assert.deepEqual(new Set(Object.keys(glyphs)), new Set(lines.flatMap(line => Array.from(line.quote))));
  assert.equal(drawn, Object.keys(glyphs).length);
});
