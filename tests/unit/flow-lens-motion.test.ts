import { LENS, LensMotion } from '@/lib/flow-browser/lens-motion';

test('a press grows the lens over the long-press threshold, at the pressed point', () => {
  const lens = new LensMotion();
  expect(lens.sample(0)).toBe(0);
  lens.press(120, 300, 1000);
  expect(lens.x).toBe(120); expect(lens.y).toBe(300);
  const early = lens.sample(1000 + LENS.growMs * .3);
  expect(early).toBeGreaterThan(0);
  expect(early).toBeLessThan(1);
  expect(lens.sample(1000 + LENS.growMs)).toBe(1);
  expect(lens.moving).toBe(false);
});

test('releasing before the threshold lets the lens recede from where it was', () => {
  const lens = new LensMotion();
  lens.press(50, 60, 0);
  const partial = lens.sample(LENS.growMs / 2);
  lens.release(LENS.growMs / 2);
  expect(lens.sample(LENS.growMs / 2)).toBeCloseTo(partial, 5);
  expect(lens.moving).toBe(true);
  expect(lens.sample(LENS.growMs / 2 + LENS.releaseMs)).toBe(0);
  expect(lens.active).toBe(false);
});

test('holding keeps a grown lens steady until it is released', () => {
  const lens = new LensMotion();
  lens.press(10, 10, 0);
  lens.sample(LENS.growMs);
  lens.hold();
  expect(lens.sample(10_000)).toBe(1);
  lens.release(10_000);
  expect(lens.sample(10_000 + LENS.releaseMs)).toBe(0);
});

test('reduced motion never forms a lens', () => {
  const lens = new LensMotion();
  lens.press(10, 10, 0);
  expect(lens.sample(LENS.growMs, true)).toBe(0);
  expect(lens.active).toBe(false);
});
