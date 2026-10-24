import { StreamManualScroll, StreamScrollMotion } from '@/lib/flow-browser/stream-scroll-motion';

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

test('rapid forward and reverse manual travel complete ink across short inertia gaps', () => {
  const manual = new StreamManualScroll();
  manual.input(0, 0);
  expect(manual.sample(30, 16, 844)).toBe(true);
  expect(manual.sample(30, 100, 844)).toBe(true);
  expect(manual.sample(30, 200, 844)).toBe(false);
  manual.input(30, 210);
  expect(manual.sample(-80, 226, 844)).toBe(true);
  expect(manual.sample(-110, 242, 844)).toBe(true);
});

test('slow manual flow and automatic or restored jumps keep the original reveal', () => {
  const manual = new StreamManualScroll();
  expect(manual.sample(0, 0, 844)).toBe(false);
  expect(manual.sample(10000, 16, 844)).toBe(false);
  manual.input(10000, 20);
  expect(manual.sample(10000.2, 36, 844)).toBe(false);
  expect(manual.sample(10003.2, 52, 844)).toBe(false);
  expect(manual.sample(10006.2, 68, 844)).toBe(false);
});

test('small screens use the speed floor and large screens require a viewport per second', () => {
  const mobile = new StreamManualScroll(), desktop = new StreamManualScroll();
  mobile.input(0, 0); desktop.input(0, 0);
  expect(mobile.sample(8, 16, 320)).toBe(false);
  expect(mobile.sample(20, 32, 320)).toBe(true);
  expect(desktop.sample(12, 16, 1200)).toBe(false);
  expect(desktop.sample(34, 32, 1200)).toBe(true);
});

test('pause, restore, expired input and backwards time discard manual fast travel', () => {
  const manual = new StreamManualScroll();
  manual.input(0, 0); expect(manual.sample(40, 16, 844)).toBe(true);
  manual.reset(); expect(manual.sample(9000, 32, 844)).toBe(false);
  manual.input(9000, 40); expect(manual.sample(9040, 56, 844)).toBe(true);
  expect(manual.sample(10000, 1300, 844)).toBe(false);
  manual.input(10000, 1400); expect(manual.sample(10040, 1416, 844)).toBe(true);
  expect(manual.sample(10100, 1400, 844)).toBe(false);
});
