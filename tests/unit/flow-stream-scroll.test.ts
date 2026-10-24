import { StreamScrollMotion } from '@/lib/flow-browser/stream-scroll-motion';

test.each([1, .5])('each frame advances smoothly when native scroll rounds to %s px', quantum => {
  const motion = new StreamScrollMotion();
  let actual = 0, previous = 0;
  for (let frame = 0; frame <= 600; frame++) {
    const top = motion.frame(actual, frame * 1000 / 60, true, 1000);
    actual = Math.round(top / quantum) * quantum;
    const remainder = motion.applied(actual);
    expect(actual + remainder).toBeCloseTo(frame * .2, 9);
    expect(Math.abs(remainder)).toBeLessThanOrEqual(quantum / 2 + 1e-9);
    if (frame) expect(top - previous).toBeCloseTo(.2, 9);
    previous = top;
  }
  expect(previous).toBeCloseTo(120, 9);
});

test('pause, hidden time and the first resumed frame never accumulate catch-up travel', () => {
  const motion = new StreamScrollMotion(40);
  motion.frame(40, 0, true, 1000); motion.applied(40);
  expect(motion.frame(40, 20, true, 1000)).toBeCloseTo(40.24);
  motion.applied(40);
  expect(motion.frame(40, 10000, false, 1000)).toBeCloseTo(40.24); motion.applied(40);
  expect(motion.frame(40, 20000, true, 1000)).toBeCloseTo(40.24); motion.applied(40);
  expect(motion.frame(40, 20020, true, 1000)).toBeCloseTo(40.48);
});

test('external scrolling rebases the logical cursor without dropping its fractional remainder', () => {
  const motion = new StreamScrollMotion();
  motion.frame(0, 0, true, 1000); motion.applied(0);
  motion.frame(0, 20, true, 1000); motion.applied(0);
  expect(motion.position(70)).toBeCloseTo(70.24);
  expect(motion.frame(70, 40, true, 1000)).toBeCloseTo(70.48); motion.applied(70);
  expect(motion.frame(10, 60, true, 1000)).toBeCloseTo(10.72);
});

test('bounds release accumulated movement and saved fractional positions restore exactly', () => {
  const motion = new StreamScrollMotion(99.9);
  motion.frame(99.9, 0, true, 100); motion.applied(99.9);
  expect(motion.frame(99.9, 20, true, 100)).toBe(100); motion.applied(100);
  expect(motion.frame(100, 40, true, 100)).toBe(100); motion.applied(100);
  expect(motion.frame(90, 60, false, 100)).toBe(90);
  motion.reset(37.4, 37);
  expect(motion.position(37)).toBeCloseTo(37.4);
  expect(motion.frame(37, 9000, true, 100)).toBeCloseTo(37.4);
  expect(motion.applied(37)).toBeCloseTo(.4);
});

test('long frame gaps retain the existing 48ms movement cap and time cannot run backwards', () => {
  const motion = new StreamScrollMotion();
  motion.frame(0, 100, true, 100); motion.applied(0);
  expect(motion.frame(0, 1100, true, 100)).toBeCloseTo(.576); motion.applied(.576);
  expect(motion.frame(.576, 1090, true, 100)).toBeCloseTo(.576);
});
