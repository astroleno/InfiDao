import { backingPixelRatio, browserFontSize } from '@/lib/flow-browser/renderer-host';
const { sceneMetrics, readingLines } = require('../../shared/flow/scene') as {
  sceneMetrics: (width: number, height: number) => { radius: number; pitch: number; fontSize: number };
  readingLines: (frames: Array<{ id: string; quote: string; quoteStart: number; quoteEnd: number; fullText: string }>) => Array<{ passageId: string; quote: string; lineStart: number }>;
};

describe('browser flow renderer boundary', () => {
  test('caps canvas backing pixels on phone and desktop while preserving logical layout', () => {
    expect(backingPixelRatio(390, 844, 3)).toBe(2);
    const wideRatio = backingPixelRatio(3840, 2160, 2);
    expect(wideRatio).toBeLessThan(1);
    expect(3840 * 2160 * wideRatio ** 2).toBeLessThanOrEqual(2_500_000);
    const giantRatio = backingPixelRatio(7680, 4320, 2);
    expect(Math.round(7680 * giantRatio) * Math.round(4320 * giantRatio)).toBeLessThanOrEqual(2_500_000);
    const phone = sceneMetrics(390, 844);
    const desktop = sceneMetrics(1280, 720);
    expect(phone.radius).toBe(195);
    expect(desktop.radius).toBeGreaterThan(phone.radius);
    expect(phone.pitch).toBeGreaterThan(0);
  });

  test('keeps passage identity and source offsets through wheel line preparation', () => {
    const frame = { id: 'chain:frame', quote: '物有本末，事有终始。', quoteStart: 0,
      quoteEnd: 10, fullText: '物有本末，事有终始。知所先后，则近道矣。' };
    const lines = readingLines([frame]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(line => line.passageId === frame.id)).toBe(true);
    expect(lines.map(line => line.lineStart)).toEqual([0]);
  });

  test('fits long landscape lines into the front arc without changing portrait sizing', () => {
    expect(browserFontSize(390, 844)).toBe(sceneMetrics(390, 844).fontSize);
    const { quotationGeometry, projectedGlyphs } = require('../../shared/flow/scene');
    const quote = '甲乙丙丁戊己庚辛壬癸';
    const glyphs = Object.fromEntries(Array.from(quote, char => [char, [0, 0, 1, 1]]));
    for (const [width, height] of [[844, 390], [1280, 720], [667, 375]]) {
      const metrics = sceneMetrics(width!, height!);
      const vertices = quotationGeometry([{ quote }], glyphs, metrics.radius, browserFontSize(width!, height!), height! / 2);
      const boxes = projectedGlyphs(vertices, 0, 1, width, height);
      expect(boxes).toHaveLength(10);
      for (let i = 1; i < boxes.length; i++) {
        const previous = boxes[i - 1], current = boxes[i];
        // Atlas cells include blank margins; the actual ink uses their inner 2/3.
        const previousInkRight = previous.right - (previous.right - previous.left) / 6;
        const currentInkLeft = current.left + (current.right - current.left) / 6;
        expect(currentInkLeft).toBeGreaterThanOrEqual(previousInkRight);
      }
    }
  });
});
