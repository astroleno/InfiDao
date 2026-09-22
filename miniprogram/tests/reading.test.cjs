const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createMockProvider } = require('../flow/provider');
const { FlowTimeline, CELL } = require('../flow/timeline');
const { readingLines } = require('../flow/scene');
const { WheelRenderer } = require('../flow/renderer');

function clock() {
  let time = 0, serial = 0;
  const tasks = new Map();
  return {
    set(fn, delay = 0) { const id = ++serial; tasks.set(id, { fn, at: time + delay }); return id; },
    clear(id) { tasks.delete(id); },
    advance(ms) {
      const end = time + ms;
      for (let count = 0; count < 10000; count++) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { time = end; return; }
        time = next[1].at; tasks.delete(next[0]); next[1].fn(time);
      }
      throw new Error('Unbounded timer loop');
    },
  };
}

async function setup() {
  const time = clock();
  let definition, pulses = 0;
  const file = path.resolve(__dirname, '../pages/flow/index.js');
  const wx = {
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, statusBarHeight: 47, safeArea: { bottom: 810 }, pixelRatio: 3 }),
    nextTick: fn => time.set(fn), hideKeyboard() {},
    vibrateShort() { pulses++; },
    canvasToTempFilePath(options) { time.set(() => options.success({ tempFilePath: 'mock-frame.png' }), 16); },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: createRequire(file), Page: value => { definition = value; }, wx,
    setTimeout: time.set, clearTimeout: time.clear, console,
  }, { filename: file });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) };
  page.setData = (patch, complete) => { Object.assign(page.data, patch); if (complete) complete(); };
  page.onLoad();
  page._session = await createMockProvider().open('我想让心慢下来');
  page._readingLines = readingLines(page._session.frames);
  page._timeline = new FlowTimeline(page._readingLines.length);
  page.updateActive(true);
  page.setData({ ready: true, loading: false });
  let generation = 0;
  const renderer = {
    running: true, reading: 0, canvas: {}, scrollPitch: 140,
    draw() {}, stop() { this.running = false; generation++; },
    start() { this.running = true; }, destroy() { this.stop(); },
    animateTo(options, complete) {
      this.stop(); const task = generation;
      time.set(() => {
        if (task !== generation) return;
        if (options.position !== undefined) page._timeline.position = options.position;
        this.reading = options.reading;
        if (complete) complete();
      }, options.duration);
    },
    center(complete) { this.animateTo({ position: (page._timeline.index + 0.46) * CELL, reading: 1, duration: 420 }, complete); },
    restore(complete) { this.animateTo({ reading: 0, duration: 240 }, complete); },
  };
  page._renderer = renderer;
  function decode() {
    const token = page.data.shots.at(-1).token;
    page.onSnapshotLoad({ currentTarget: { dataset: { token } } });
    time.advance(0);
  }
  function pause() { page.togglePause(); time.advance(440); decode(); }
  return { page, time, renderer, decode, pause, pulses: () => pulses };
}

test('pause preserves the canvas until the matching still image is decoded, then reveals the complete passage', async () => {
  const { page, time, decode, pulses } = await setup();
  page._timeline.move(1); // The second half of a quotation.
  page.updateActive(true);
  page.togglePause();
  time.advance(440);
  assert.equal(page.data.snapshotReady, false);
  assert.equal(page.data.readingVisible, false);
  assert.equal(page.data.active.passageQuote, '知止而后有定，定而后能静。');
  assert.equal(pulses(), 0);
  decode();
  assert.equal(page.data.snapshotReady, true);
  assert.equal(page.data.readingVisible, true);
  assert.equal(page.data.phase, 'reading');
  assert.equal(pulses(), 1);
  assert.ok(page.data.active.meaning && page.data.active.reflection);
  assert.equal(page.data.sourceParts.find(part => part.selected).text, '知止而后有定，定而后能静');
});

test('resume invalidates a late image load and keeps the same reading position', async () => {
  const { page, time } = await setup();
  page.togglePause(); time.advance(440);
  const token = page.data.shots[0].token;
  const position = page._timeline.position;
  page.resumeFlow(); time.advance(300);
  page.onSnapshotLoad({ currentTarget: { dataset: { token } } });
  time.advance(3000);
  assert.equal(page.data.phase, 'flow');
  assert.equal(page.data.snapshotReady, false);
  assert.equal(page.data.readingVisible, false);
  assert.equal(page._timeline.position, position);
  assert.equal(page._timeline.flow, 0);
  assert.equal(page._renderer.running, true);
});

test('source expands around the same quotation and waits for its exit before unmounting', async () => {
  const { page, time, pause } = await setup();
  pause();
  const position = page._timeline.position, shot = page.data.shots[0].src;
  page.openSource();
  assert.equal(page.data.sourceOpen, true);
  assert.ok(page.data.sceneShift > 0);
  assert.equal(page.data.shots[0].src, shot);
  assert.equal(page._timeline.position, position);
  page.closeSource();
  assert.equal(page.data.sceneShift, 0);
  assert.equal(page.data.sourceMounted, true);
  time.advance(340);
  assert.equal(page.data.sourceMounted, false);
});

test('a stationary finger and a cancelled touch preserve the reading layer and snapshot', async () => {
  const { page, pause } = await setup();
  pause();
  const shot = page.data.shots[0].src;
  page.onTouchStart({ touches: [{ clientX: 190, clientY: 390 }], timeStamp: 100 });
  page.onTouchMove({ touches: [{ clientX: 192, clientY: 392 }], timeStamp: 116 });
  assert.equal(page.data.readingVisible, true);
  assert.equal(page.data.snapshotReady, true);
  assert.equal(page.data.phase, 'reading');
  page.onTouchCancel();
  assert.equal(page.data.shots[0].src, shot);
  assert.equal(page.data.readingVisible, true);
  assert.equal(page._timeline.dragging, false);
});

test('only a confirmed drag hides the reading layer and moves the wheel', async () => {
  const { page, pause } = await setup();
  pause();
  const position = page._timeline.position;
  page.onTouchStart({ touches: [{ clientX: 190, clientY: 390 }], timeStamp: 100 });
  page.onTouchMove({ touches: [{ clientX: 190, clientY: 430 }], timeStamp: 120 });
  assert.equal(page.data.readingVisible, false);
  assert.equal(page.data.snapshotReady, false);
  assert.notEqual(page._timeline.position, position);
});

test('a tapped neighbouring row becomes the settled quotation and duplicate tap is ignored', async () => {
  const { page, renderer, time, decode } = await setup();
  renderer.hitTest = () => ({ index: 2 });
  page.onTouchStart({ touches: [{ clientX: 190, clientY: 530 }], timeStamp: 100 });
  page.onTouchEnd();
  page.onCanvasTap();
  time.advance(440); decode();
  assert.equal(page._timeline.index, 2);
  assert.equal(page.data.active.quote, '物有本末');
  assert.equal(page.data.paused, true);
});

test('source opens at its heading and keeps a separate scroll position from short reading', async () => {
  const { page, pause, time } = await setup();
  pause();
  page.onReadingScroll({ detail: { scrollTop: 48 } });
  page.openSource();
  time.advance(50);
  assert.equal(page.data.sourceTarget, 'source-heading');
  page.onReadingScroll({ detail: { scrollTop: 380 } });
  page.closeSource();
  assert.equal(page.data.readingScroll, 48);
  page.openSource();
  time.advance(0);
  assert.equal(page.data.readingScroll, 380);
  assert.equal(page.data.sourceTarget, '');
});

test('closing the source cancels a pending native anchor scroll', async () => {
  const { page, pause, time } = await setup();
  pause(); page.openSource(); time.advance(1); page.closeSource(); time.advance(60);
  assert.equal(page.data.sourceTarget, '');
  assert.equal(page.data.readingScroll, 0);
});

test('editing preserves an actual thought and never attributes the default example to the user', async () => {
  const { page, pause, time } = await setup();
  pause(); page.openSeed();
  assert.equal(page.data.draft, '');
  page.closeOverlay(); time.advance(250);
  page.setData({ personalSeed: true, seed: '我想重新开始' });
  page.openSeed();
  assert.equal(page.data.draft, '我想重新开始');
});

test('a reduced-motion preference settles the wheel while an explicit continue remains available', async () => {
  const { page, time, decode } = await setup();
  const query = { select() { return this; }, fields() { return this; }, exec(callback) { callback([{ opacity: '0' }]); } };
  page.createSelectorQuery = () => query;
  page.readMotionPreference();
  assert.equal(page.data.paused, true);
  assert.equal(page._renderer.reducedMotion, true);
  time.advance(440); decode();
  page.resumeFlow(); time.advance(500);
  page.readMotionPreference();
  assert.equal(page.data.paused, false);
  assert.equal(page.data.phase, 'flow');
});

test('native touchend pauses without a synthetic tap, while a duplicate tap never resumes it', async () => {
  const { page, time, decode } = await setup();
  page.onTouchStart({ touches: [{ clientX: 190, clientY: 350 }], timeStamp: 10 });
  page.onTouchEnd();
  assert.equal(page.data.paused, true);
  page.onCanvasTap();
  assert.equal(page.data.paused, true);
  time.advance(440); decode();
  assert.equal(page.data.readingVisible, true);
  page.onTouchStart({ touches: [{ clientX: 190, clientY: 350 }], timeStamp: 500 });
  assert.equal(page.data.shots.length, 1, 'the original touch target must remain mounted');
  page.onTouchEnd();
  page.onCanvasTap();
  time.advance(500);
  assert.equal(page.data.paused, false);
  assert.equal(page.data.phase, 'flow');
});

test('quickly closing the input sheet cancels delayed focus and preserves the scene', async () => {
  const { page, time, pause } = await setup();
  pause(); page.openSeed(); time.advance(0);
  assert.equal(page.data.overlayVisible, true);
  assert.equal(page.data.inputFocus, false);
  page.closeOverlay();
  assert.equal(page.data.overlay, 'seed');
  time.advance(240);
  assert.equal(page.data.overlay, '');
  time.advance(500);
  assert.equal(page.data.inputFocus, false);
  assert.equal(page.data.snapshotReady, true);
  assert.equal(page.data.readingVisible, true);
});

test('backgrounding during capture rejects stale callbacks and can settle again on return', async () => {
  const { page, time, decode } = await setup();
  page.togglePause(); time.advance(425);
  page.onHide(); time.advance(3000);
  assert.equal(page.data.shots.length, 0);
  assert.equal(page.data.readingVisible, false);
  page.onShow(); time.advance(440); decode();
  assert.equal(page.data.phase, 'reading');
  assert.equal(page.data.readingVisible, true);
});

test('the next passage moves past all split lines and keeps its own explanation', async () => {
  const { page, time, pause, decode } = await setup();
  pause(); page.openSource(); page.next();
  time.advance(800); decode();
  assert.equal(page.data.active.passageId, 'order');
  assert.equal(page.data.active.lineIndex, 0);
  assert.equal(page.data.ordinal, '02');
  assert.equal(page.data.active.passageQuote, '物有本末，事有终始。');
  assert.ok(page.data.active.meaning.includes('先后'));
});

test('a thought submitted just before backgrounding still arrives when the page returns', async () => {
  const { page, time, pause } = await setup();
  pause(); page.openSeed(); time.advance(0);
  await page.loadSession('想开始学习');
  let initialized = 0;
  page.initRenderer = () => { initialized++; };
  page.onHide(); time.advance(1000); page.onShow();
  assert.equal(page._session.journey, 'act');
  assert.equal(page.data.loading, false);
  assert.equal(initialized, 1);
});

test('graphics failure keeps full context, explanations and passage navigation', async () => {
  const { page, time } = await setup();
  page.graphicsFailed(new Error('context lost'));
  assert.equal(page.data.graphicsError, true);
  assert.equal(page.data.readingVisible, true);
  page.next(); time.advance(200);
  assert.equal(page.data.active.passageId, 'order');
  assert.ok(page.data.active.passageQuote && page.data.active.meaning);
});

test('a delayed provider reply after returning from background cannot strand the loading state', async () => {
  const { page, time, pause } = await setup();
  pause(); page.openSeed(); time.advance(0);
  let resolve;
  page._provider = { open: () => new Promise(done => { resolve = done; }) };
  const loading = page.loadSession('如何与他人相处');
  page.onHide(); page.onShow();
  let initialized = 0;
  page.initRenderer = () => initialized++;
  resolve(await createMockProvider().open('如何与他人相处'));
  await loading; time.advance(300);
  assert.equal(page.data.loading, false);
  assert.equal(page._session.journey, 'relate');
  assert.equal(initialized, 1);
});

test('unload cancels delayed focus and captures without touching a disposed page', async () => {
  const { page, time, pause } = await setup();
  pause(); page.openSeed(); time.advance(0);
  page.onUnload();
  page.setData = () => { throw new Error('setData after unload'); };
  time.advance(3000);
});

test('backgrounding while the source closes finalizes the invisible source content', async () => {
  const { page, time, pause } = await setup();
  pause(); page.openSource(); page.closeSource(); page.onHide();
  time.advance(1000); page.onShow();
  assert.equal(page.data.sourceOpen, false);
  assert.equal(page.data.sourceMounted, false);
  assert.equal(page.data.readingVisible, true);
});

test('a renderer settle cancels the old loop without losing its own animation frame', () => {
  const time = clock();
  const renderer = Object.create(WheelRenderer.prototype);
  Object.assign(renderer, { canvas: { requestAnimationFrame: fn => time.set(fn, 16), cancelAnimationFrame: time.clear },
    timeline: new FlowTimeline(8), count: 8, frameId: null, motionGeneration: 0,
    running: false, destroyed: false, reading: 0, draw() {} });
  let settled = 0;
  renderer.onFrame = () => {
    if (renderer.running) renderer.center(() => settled++);
  };
  renderer.start(); time.advance(500);
  assert.equal(settled, 1);
  assert.equal(renderer.reading, 1);
  assert.equal(renderer.frameId, null);
  renderer.center(() => settled++);
  time.advance(50); renderer.stop(); time.advance(500);
  assert.equal(settled, 1, 'cancelled animation must not complete');
});
