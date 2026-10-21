import { ribbonProjection } from '@/lib/flow-browser/ribbon-optics';
import { bendSettings, bendDisplayPoint } from '@/lib/flow-browser/bend';

const viewport = { viewportWidth: 1440, viewportHeight: 900, scrollTop: 0, reducedMotion: false };

test('words share a horizontal baseline and common scale origin without tilt or perspective', () => {
  const left = ribbonProjection({ ...viewport, x: 440, y: 200, wordWidth: 80 });
  const right = ribbonProjection({ ...viewport, x: 940, y: 200, wordWidth: 60 });
  expect(left.transform).toBe(right.transform);
  expect(left.blur).toBe(right.blur);
  expect(440 - 40 + parseFloat(left.origin)).toBe(720);
  expect(940 - 30 + parseFloat(right.origin)).toBe(720);
  expect(left.transform).toMatch(/^scale\(/);
  expect(left.transform).not.toMatch(/rotate|perspective|skew/);
});

test('the center is clear and the nearer upper/lower rim defocuses without another scale', () => {
  const center = ribbonProjection({ ...viewport, x: 720, y: 450, wordWidth: 80 });
  const upper = ribbonProjection({ ...viewport, x: 720, y: 90, wordWidth: 80 });
  const lower = ribbonProjection({ ...viewport, x: 720, y: 810, wordWidth: 80 });
  expect(center.blur).toBe(0); expect(center.opacity).toBe(1);
  expect(center.scale).toBe(1);
  expect(upper.blur).toBeGreaterThan(0); expect(upper.blur).toBe(lower.blur);
  expect(upper.transform).toBe(lower.transform);
  expect(upper.scale).toBe(1); expect(lower.scale).toBe(1);
  expect(upper.transform).not.toMatch(/rotate|perspective|skew/);
});

test('the reading band stays sharp even where the continuous arc has started', () => {
  for (const y of [350, 450, 550]) {
    const projection = ribbonProjection({ ...viewport, x: 720, y, wordWidth: 80 });
    expect(projection.blur).toBe(0); expect(projection.opacity).toBe(1);
  }
  expect(bendDisplayPoint(440, 350, bendSettings(1440, 900)).x).toBeLessThan(440);
});

test('mobile rims soften more than desktop rims', () => {
  const word = { ...viewport, x: 195, y: 0, wordWidth: 30 };
  const desktop = ribbonProjection(word);
  const mobile = ribbonProjection({ ...word, viewportWidth: 390, viewportHeight: 844 });
  expect(mobile.blur).toBeGreaterThan(desktop.blur);
  expect(mobile.opacity).toBeCloseTo(.22);
  expect(mobile.scale).toBe(desktop.scale);
});

test('adjacent mobile lines have a clear focus gradient instead of subpixel blur', () => {
  const word = { ...viewport, viewportWidth: 390, viewportHeight: 844, x: 195, wordWidth: 30 };
  const outer = ribbonProjection({ ...word, y: 200 });
  const adjacent = ribbonProjection({ ...word, y: 260 });
  const central = ribbonProjection({ ...word, y: 422 });
  expect(outer.blur).toBeGreaterThan(4);
  expect(adjacent.blur).toBeGreaterThan(1);
  expect(outer.blur).toBeGreaterThan(adjacent.blur);
  expect(outer.opacity).toBeLessThan(adjacent.opacity);
  expect(central.blur).toBe(0); expect(central.opacity).toBe(1);
});

test('scrolling a line through the focus unfolds the existing line instead of swapping content', () => {
  const word = { ...viewport, x: 440, y: 774, wordWidth: 80 };
  const near = ribbonProjection(word);
  const focused = ribbonProjection({ ...word, scrollTop: 324 });
  expect(near.origin).toBe(focused.origin);
  expect(near.blur).toBeGreaterThan(0);
  expect(focused.blur).toBe(0); expect(focused.scale).toBe(1);
});

test('reduced motion is clear and static at every depth, including narrow viewports', () => {
  for (const y of [0, 400, 844, 1600]) {
    const projection = ribbonProjection({ ...viewport, viewportWidth: 390, viewportHeight: 844,
      reducedMotion: true, x: 100, y, wordWidth: 36 });
    expect(projection.transform).toBe('none');
    expect(projection.blur).toBe(0); expect(projection.opacity).toBe(1);
  }
});
