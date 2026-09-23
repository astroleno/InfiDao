const test = require('node:test');
const assert = require('node:assert/strict');
const { RibbonWindow, SLOT_COUNT } = require('../flow/ribbon-window');
const { readingLines, rowMotion, sceneMetrics, quotationGeometry, projectedRows } = require('../flow/scene');
const { FlowTimeline, CELL, CENTER_PHASE, modulo } = require('../flow/timeline');
const lines = (start, count) => Array.from({ length: count }, (_, i) => ({ id: 'line-' + (start + i), passageId: 'p-' + (start + i), quote: '知止而后有定', centerOffset: 0 }));
const visible = (ribbon, cursor, guard = 6) => ribbon.frames(cursor).filter(row => Math.abs(row.occurrence - cursor) <= guard)
  .map(row => [row.occurrence, row.id]).sort((a, b) => a[0] - b[0]);

test('late batches preserve every visible occurrence, including the already visible beginning of the next loop', () => {
  for (const cursor of [0, 1.8, 14, 14.49, 15, 31.9, 125.5, -9.5]) {
    const ribbon = new RibbonWindow(lines(0, 15), cursor);
    const before = visible(ribbon, cursor);
    ribbon.update(lines(0, 21), cursor);
    assert.deepEqual(visible(ribbon, cursor), before);
    assert.equal(ribbon.frames(cursor).length, SLOT_COUNT);
    assert.ok(ribbon.frames(cursor).some(row => row.id === 'line-15'));
  }
});
test('successive arrivals do not discard new passages still approaching from outside the viewport', () => {
  const ribbon = new RibbonWindow(lines(0, 15), 14);
  ribbon.update(lines(0, 21), 14); ribbon.update(lines(0, 27), 14);
  const encountered = new Set();
  for (let cursor = 14; cursor < 65; cursor++) {
    const row = ribbon.frames(cursor).find(item => item.occurrence === cursor);
    encountered.add(row.id);
    assert.equal(ribbon.rows.size, SLOT_COUNT);
  }
  for (let i = 15; i < 27; i++) assert.ok(encountered.has('line-' + i));
});
test('infinite motion, reverse scrubbing and snapshot restoration retain bounded slots and row identity', () => {
  const timeline = new FlowTimeline(SLOT_COUNT), ribbon = new RibbonWindow(lines(0, 21));
  for (let i = 0; i < 300; i++) {
    timeline.advancePosition(CELL);
    const cursor = timeline.position / CELL - CENTER_PHASE + timeline.rowOffset;
    const rows = ribbon.frames(cursor);
    for (const row of rows) assert.equal(modulo(row.occurrence, SLOT_COUNT), rows.indexOf(row));
    assert.equal(ribbon.rows.size, SLOT_COUNT);
  }
  const cursor = timeline.position / CELL - CENTER_PHASE + timeline.rowOffset;
  const before = visible(ribbon, cursor);
  ribbon.frames(cursor - 4); ribbon.frames(cursor);
  assert.deepEqual(visible(ribbon, cursor), before);
  const restored = new RibbonWindow(lines(0, 21), cursor, ribbon.snapshot());
  assert.deepEqual(visible(restored, cursor), before);
});
test('grouped clause centers share the same projection and selection coordinates', () => {
  const rows = readingLines([{ id: 'a', quote: '知止而后有定，定而后能静。' }, { id: 'b', quote: '物有本末，事有终始。' }]);
  const timeline = new FlowTimeline(rows.length); timeline.centers = rows.map(row => row.centerOffset);
  const inner = 1 + rows[1].centerOffset - rows[0].centerOffset;
  const boundary = 1 + rows[2].centerOffset - rows[1].centerOffset;
  assert.ok(inner < 1 && boundary > 1);
  const glyphs = Object.fromEntries(rows.flatMap(row => Array.from(row.quote)).map(char => [char, [0, 0, 1, 1]]));
  const m = sceneMetrics(390, 725), vertices = quotationGeometry(rows, glyphs, m.radius, m.fontSize, 725 / 2);
  for (let index = 0; index < rows.length; index++) {
    timeline.position = timeline.targetFor(index);
    assert.equal(timeline.index, index);
    const cursor = timeline.position / CELL - CENTER_PHASE;
    assert.ok(Math.abs(rowMotion(index, cursor, rows.length, 0, true, rows[index].centerOffset).distance) < 1e-10);
    const hit = projectedRows(vertices, cursor, rows.length, 390, 725).find(row => row.index === index);
    assert.ok(Math.abs((hit.top + hit.bottom) / 2 - 725 / 2) < 0.01);
  }
});
test('a late batch joins after all clauses of the passage already entering view', () => {
  const original = readingLines([{ id: 'a', quote: '知止而后有定，定而后能静，静而后能安。' }]);
  const more = readingLines([{ id: 'b', quote: '物有本末，事有终始。' }]);
  const ribbon = new RibbonWindow(original, 0);
  ribbon.update([...original, ...more], 0);
  const future = ribbon.frames(0).filter(row => row.occurrence >= 0).sort((a, b) => a.occurrence - b.occurrence);
  const firstNew = future.findIndex(row => row.passageId === 'b');
  assert.equal(future[firstNew - 1].lineIndex, original.length - 1);
});

test('a thousand forward steps consume all new nodes while the page keeps a bounded content and display window', () => {
  const { chainActions } = require('../flow/chain-page');
  const frame = i => ({ id: 'f' + i, ordinal: i + 1, quote: '知止而后有定，定而后能静。', anchors: [] });
  const page = { ...chainActions, _session: { chainId: 'test', frames: [0, 1, 2].map(frame) },
    _timeline: new FlowTimeline(SLOT_COUNT), _windowStart: 0, _window: { windowWidth: 390 },
    data: { sceneHeight: 725 }, _chainStore: { saveWindow() {} },
    setData(patch) { Object.assign(this.data, patch); },
    updateActive() { this.data.active = this._readingLines[this._timeline.index]; }, syncMotion() {} };
  page._ribbon = new RibbonWindow(readingLines(page._session.frames));
  page.syncRibbon(true); page.updateActive();
  let added = 3; const encountered = new Set();
  for (let step = 0; step < 1000; step++) {
    page._timeline.advancePosition(CELL); page.syncRibbon(); page.updateActive();
    encountered.add(page.data.active.passageId);
    if (page.data.active.ordinal >= added - 1 && added < 200) {
      page.replaceChainBatch({ ...page._session, frames: [added, added + 1, added + 2].map(frame) }); added += 3;
    }
    page.trimChainWindow();
    assert.equal(page._ribbon.rows.size, SLOT_COUNT);
    assert.ok(page._session.frames.length <= 12 + SLOT_COUNT);
    for (const id of page._ribbon.usedPassages()) assert.ok(page._session.frames.some(frame => frame.id === id));
  }
  assert.equal(encountered.size, added);
  assert.ok(page._windowStart > 0);
  const latest = page._session.frames.at(-1).ordinal;
  page._session.cursor = String(latest); page._session.exhausted = true;
  const first = page._session.frames[0];
  page.replaceChainBatch({ ...page._session, frames: [{ ...first, reflection: '后到的解释' }], cursor: '3', exhausted: false });
  assert.equal(page._session.cursor, String(latest));
  assert.equal(page._session.exhausted, true);
  assert.equal(page._session.frames[0].reflection, '后到的解释');
  page._session.exhausted = false;
  page.replaceChainBatch({ ...page._session, frames: [], cursor: null, exhausted: true });
  assert.equal(page._session.cursor, null);
  assert.equal(page._session.exhausted, true);
});
