const shared = require('../../shared/flow');
const native = {
  ...require('../../miniprogram/flow/timeline'),
  ...require('../../miniprogram/flow/ribbon-window'),
  ...require('../../miniprogram/flow/scene'),
  ...require('../../miniprogram/flow/classic-text'),
  ...require('../../miniprogram/flow/text-spans'),
  ...require('../../miniprogram/flow/touch-point'),
  ...require('../../miniprogram/flow/atmosphere'),
};
type TestFrame = { id: string; quote: string; ordinal: number; quoteStart: number; quoteEnd: number; fullText: string };
type TestLine = TestFrame & { passageId: string; occurrence: number; lineIndex: number };

describe('shared flow runtime compatibility', () => {
  test('ships the current shared controller in the native package', () => {
    const fs = require('node:fs');
    expect(fs.readFileSync(require.resolve('../../miniprogram/flow/generated/shared/controller'), 'utf8'))
      .toBe(fs.readFileSync(require.resolve('../../shared/flow/controller'), 'utf8'));
  });
  test('native package wrappers and shared sources expose identical behavior', () => {
    const a = new shared.FlowTimeline(7);
    const b = new native.FlowTimeline(7);
    for (const now of [0, 16, 32, 48, 64, 80, 160, 320]) {
      a.tick(now);
      b.tick(now);
    }
    expect(b.position).toBe(a.position);
    expect(b.ambientPhase).toBe(a.ambientPhase);
    expect(shared.sceneMetrics(390, 844)).toEqual(native.sceneMetrics(390, 844));
    expect(shared.rowMotion(2, 4.7, 7, 21)).toEqual(native.rowMotion(2, 4.7, 7, 21));
    expect(shared.focusAt(18, 34)).toEqual(native.focusAt(18, 34));
    expect(shared.touchPoint({ x: 12, y: 34 }, 80)).toEqual(native.touchPoint({ x: 12, y: 34 }, 80));
    expect(shared.inkLight(0.37)).toEqual(native.inkLight(0.37));
  });

  test('shared timeline preserves rotation identity over a slot loop', () => {
    const timeline = new shared.FlowTimeline(32);
    timeline.position = 32 * shared.CELL - 1;
    const ordinalBefore = shared.rowMotion(0, timeline.position / shared.CELL - shared.CENTER_PHASE, 32, 0).ordinal;
    timeline.advancePosition(3);
    expect(timeline.rowOffset).toBe(32);
    expect(timeline.position).toBe(2);
    expect(shared.rowMotion(0, timeline.position / shared.CELL - shared.CENTER_PHASE, 32, timeline.rowOffset).ordinal).toBe(
      ordinalBefore,
    );
  });

  test.each([31, 32])('keeps the same unwrapped row identity through repeated %i-slot loops', count => {
    const timeline = new shared.FlowTimeline(count);
    const initial = timeline.position / shared.CELL + timeline.rowOffset;
    const travel = count * 5 + 3;
    timeline.advancePosition(travel * shared.CELL);

    expect(timeline.rowOffset).toBe(count * 5);
    expect(timeline.position / shared.CELL + timeline.rowOffset).toBeCloseTo(initial + travel);
  });

  test('long drag travel stays continuous across multiple slot loops', () => {
    const timeline = new shared.FlowTimeline(32);
    const initial = timeline.position / shared.CELL + timeline.rowOffset;
    timeline.dragging = true;
    timeline.scrub(-20000, 400, 0.016);

    expect(timeline.position / shared.CELL + timeline.rowOffset).toBeCloseTo(initial + 50);
    expect(timeline.rowOffset).toBeGreaterThan(0);
  });

  test('shares canonical UTF-16 word identities between canvas and readable text', () => {
    type TextPart = { text: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string } };
    const frame = {
      id: 'chain:frame', quote: '知止而后有定。', fullText: '大学。知止而后有定。',
      quoteStart: 3, quoteEnd: 10, textHash: 'hash', corpusVersion: 'v1', lexicalBreaks: [2, 3, 5, 7, 8, 9, 10],
    };
    const sharedParts = shared.classicSpans(frame, 'quote') as TextPart[];
    const nativeParts = native.classicSpans(frame, 'quote') as TextPart[];
    const linkedWord = sharedParts.find(part => part.text === '知止');

    expect(nativeParts).toEqual(sharedParts);
    expect(linkedWord).toMatchObject({ anchorId: 'text:3:5', selection: { start: 3, end: 5, textHash: 'hash', corpusVersion: 'v1' } });
    expect(sharedParts.find(part => part.text === '。')?.anchorId).toBeUndefined();
  });

  test('new ribbon content joins outside the current visible rows', () => {
    const frame = (id: string, quote: string): TestFrame => ({ id, quote, ordinal: 1, quoteStart: 0, quoteEnd: quote.length, fullText: quote });
    const initial = shared.readingLines([frame('a', '甲乙丙丁')]);
    const window = new shared.RibbonWindow(initial, 0);
    const before = (window.frames(0) as Array<TestLine | undefined>).filter((line): line is TestLine => Boolean(line))
      .map(line => [line.occurrence, line.id] as [number, string]);

    window.update(shared.readingLines([frame('a', '甲乙丙丁'), frame('b', '戊己庚辛')]), 0, 6);
    const current = window.frames(0) as Array<TestLine | undefined>;
    const after = current.filter((line): line is TestLine => Boolean(line)).map(line => [line.occurrence, line.id] as [number, string]);

    expect(after.filter(([serial]) => serial <= 6)).toEqual(before.filter(([serial]) => serial <= 6));
    const joined = current.find((line): line is TestLine => line !== undefined && line.passageId === 'b');
    expect(joined?.occurrence).toBeGreaterThanOrEqual(7);
  });
});
