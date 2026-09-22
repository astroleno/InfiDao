const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FlowTimeline, CELL } = require('../flow/timeline');
const { inkLight } = require('../flow/atmosphere');
const { createMockProvider, validateSession } = require('../flow/provider');
const { passages, journeys } = require('../content/passages');

function advance(timeline, from, duration, interval = 16) {
  timeline.tick(from);
  for (let t = interval; t <= duration; t += interval) timeline.tick(from + t);
}

test('elapsed-time motion stays consistent across 30 and 60 Hz devices', () => {
  const a = new FlowTimeline(8);
  const b = new FlowTimeline(8);
  advance(a, 0, 8000, 16);
  advance(b, 0, 8000, 32);
  assert.ok(Math.abs(a.position - b.position) < 1);
  assert.ok(a.position > CELL * 0.46);
});

test('pause, drag, and background retain position; resume never catches up hidden time', () => {
  const flow = new FlowTimeline(8);
  advance(flow, 0, 1000);
  flow.paused = true;
  const position = flow.position;
  advance(flow, 1000, 5000);
  assert.equal(flow.position, position);
  flow.setVisible(false);
  flow.paused = false;
  advance(flow, 6000, 5000);
  assert.equal(flow.position, position);
  flow.setVisible(true);
  flow.tick(600000);
  assert.equal(flow.position, position);
  flow.tick(600016);
  assert.ok(flow.position > position && flow.position < position + 1);
  flow.dragging = true;
  const dragged = flow.position;
  flow.tick(600032);
  assert.equal(flow.position, dragged);
});

test('scrubbing backward and across a full loop keeps valid indices and continuous distance', () => {
  const flow = new FlowTimeline(8);
  flow.position = 3;
  flow.scrub(10, 256);
  assert.equal(flow.position, 8 * CELL - 17);
  assert.equal(flow.index, 0); // The closest ring, even just before the texture loop.
  flow.scrub(-10, 256);
  assert.equal(flow.position, 3);
  for (let i = 0; i < 30; i++) flow.move(-1);
  assert.ok(flow.position >= 0 && flow.position < 8 * CELL);
  assert.ok(flow.index >= 0 && flow.index < 8);
});

test('a stalled render frame does not skip a passage', () => {
  const flow = new FlowTimeline(8);
  flow.tick(0);
  const position = flow.position;
  flow.tick(120000);
  assert.ok(flow.position - position < 3);
});

test('background light follows travel across a loop, freezes on pause, and resumes without a jump', () => {
  const flow = new FlowTimeline(8);
  flow.position = 8 * CELL - 1;
  advance(flow, 0, 5000);
  assert.ok(flow.position < CELL, 'the quotation loop has wrapped');
  assert.ok(flow.ambientPhase > 0 && flow.ambientPhase < 0.3);
  const phase = flow.ambientPhase, light = inkLight(phase);
  flow.paused = true;
  advance(flow, 5000, 5000);
  assert.equal(flow.ambientPhase, phase);
  assert.equal(inkLight(flow.ambientPhase), light);
  flow.setVisible(false); flow.paused = false;
  advance(flow, 10000, 5000);
  assert.equal(flow.ambientPhase, phase);
  flow.setVisible(true); flow.tick(600000);
  assert.equal(flow.ambientPhase, phase);
  flow.tick(600016);
  assert.ok(flow.ambientPhase > phase && flow.ambientPhase - phase < 0.001);
});

test('a fast fling cannot make the light flicker, and reduced motion keeps a fixed light', () => {
  const flow = new FlowTimeline(8);
  flow.flinging = true; flow.velocity = CELL * 8;
  flow.tick(0); flow.tick(32);
  assert.ok(flow.position - CELL * 0.46 > 100);
  assert.ok(flow.ambientPhase < 0.002, 'light stays slow even during a rapid fling');
  for (const phase of [0, 0.25, 0.5, 0.75]) assert.equal(inkLight(phase, true), inkLight(0, true));
});

test('resume ramps after a real stopped render loop, without any paused ticks', () => {
  const flow = new FlowTimeline(8);
  advance(flow, 0, 4000);
  assert.ok(flow.flow > 0.99);
  const position = flow.position;
  flow.paused = true;
  flow.lastTime = null;
  assert.equal(flow.flow, 0);
  flow.paused = false;
  flow.tick(60000);
  assert.equal(flow.position, position);
  flow.tick(60016);
  assert.ok(flow.flow > 0 && flow.flow < 0.05);
  assert.ok(flow.position - position < 0.04);
  flow.dragging = true;
  assert.equal(flow.flow, 0);
});

test('a released flick glides with exponential decay and requests a settle', () => {
  const flow = new FlowTimeline(8);
  flow.tick(0);
  flow.dragging = true;
  flow.scrub(-20, 128, 0.016);
  flow.scrub(-20, 128, 0.016);
  flow.dragging = false;
  assert.equal(flow.release(), true);
  const position = flow.position;
  flow.tick(16);
  assert.ok(flow.position > position, 'fling glides forward');
  const v1 = flow.velocity;
  flow.tick(32);
  assert.ok(Math.abs(flow.velocity) < Math.abs(v1), 'velocity decays');
  for (let t = 64; t <= 4000; t += 32) flow.tick(t);
  assert.equal(flow.flinging, false);
  assert.equal(flow.needsSettle, true);
});

test('a slow drag release rests instead of flinging, and resume ramps up', () => {
  const flow = new FlowTimeline(8);
  flow.tick(0);
  flow.dragging = true;
  flow.scrub(2, 128, 0.05);
  flow.dragging = false;
  assert.equal(flow.release(), false);
  assert.equal(flow.flinging, false);
  // Auto-flow ramps from zero instead of snapping to full speed.
  flow.tick(16);
  flow.tick(32);
  const early = flow.position;
  flow.tick(48);
  const firstStep = flow.position - early;
  for (let t = 64; t <= 3000; t += 16) flow.tick(t);
  const late = flow.position;
  flow.tick(3016);
  assert.ok(flow.position - late > firstStep * 2, 'later steps are larger after ramp');
});

test('initial thought selects a coherent mock journey without a network dependency', async () => {
  const provider = createMockProvider();
  for (const [seed, expected] of [['心很乱', 'settle'], ['如何与同事相处', 'relate'], ['想开始学习', 'act']]) {
    const session = validateSession(await provider.open(seed));
    assert.equal(session.journey, expected);
    assert.equal(session.kind, 'mock');
    assert.equal(session.frames.length, 8);
    assert.equal(new Set(session.frames.map(frame => frame.id)).size, 8);
    assert.ok(session.frames.every(frame => frame.provenance === 'curated-mock'));
  }
  assert.ok((await provider.open('')).seed);
  assert.ok((await provider.open('念'.repeat(200))).seed.length <= 120);
  assert.throws(() => validateSession({ frames: [] }));
  assert.throws(() => validateSession({ frames: [{ id: 'a' }, { id: 'b' }] }));
});

test('every classic excerpt is backed by the exact local source, separate from mock reflections', () => {
  const corpus = fs.readFileSync(path.resolve(__dirname, '../../data/rysxguji/guji-core-v1.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const normalize = text => text.replace(/[\s，。；：！？、“”‘’]/g, '');
  for (const passage of Object.values(passages)) {
    const source = corpus.find(row => row.id === passage.sourceId);
    assert.ok(source, passage.sourceId);
    assert.equal(passage.fullText, source.text);
    assert.equal(passage.source, source.source);
    assert.ok(normalize(source.text).includes(normalize(passage.quote)));
    assert.ok(passage.meaning && passage.meaning.length < 65);
  }
  for (const frames of Object.values(journeys)) {
    assert.ok(frames.every(frame => frame.reflection.length <= 46 && frame.bridge));
  }
});
