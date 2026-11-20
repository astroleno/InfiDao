import { ARRIVAL_RISE, ArrivalRise } from '@/lib/flow-browser/arrival-rise';

const HEIGHT = 844;

test('the passage starts below the surface, rises monotonically and rests exactly', () => {
  const rise = new ArrivalRise();
  rise.begin(1000, HEIGHT);
  const start = rise.offset(1000);
  expect(start).toBeCloseTo(HEIGHT * ARRIVAL_RISE.depth, 6);
  let previous = start;
  for (let time = 1016; time < 1000 + ARRIVAL_RISE.durationMs; time += 16) {
    const offset = rise.offset(time);
    expect(offset).toBeLessThanOrEqual(previous);
    expect(offset).toBeGreaterThan(0);
    previous = offset;
  }
  expect(rise.offset(1000 + ARRIVAL_RISE.durationMs)).toBe(0);
  expect(rise.active).toBe(false);
});

test('it breaks the surface quickly and slows as it settles, so the water lights then calms', () => {
  const rise = new ArrivalRise();
  rise.begin(0, HEIGHT);
  const quarter = ARRIVAL_RISE.durationMs / 4;
  const early = rise.offset(0) - rise.offset(quarter);
  const late = rise.offset(quarter * 3) - rise.offset(quarter * 4);
  expect(early).toBeGreaterThan(late * 4);
});

test('a reading position is never pushed above its resting place', () => {
  const rise = new ArrivalRise();
  rise.begin(0, HEIGHT);
  expect(rise.offset(-50)).toBeCloseTo(HEIGHT * ARRIVAL_RISE.depth, 6);
  expect(rise.offset(1e9)).toBe(0);
});

test('it plays once; idle, finished and reduced-motion rises contribute nothing', () => {
  const idle = new ArrivalRise();
  expect(idle.offset(500)).toBe(0);
  expect(idle.active).toBe(false);

  const once = new ArrivalRise();
  once.begin(0, HEIGHT);
  once.offset(ARRIVAL_RISE.durationMs);
  once.begin(5000, HEIGHT);
  expect(once.offset(5000)).toBe(0);

  const reduced = new ArrivalRise();
  reduced.begin(0, HEIGHT);
  expect(reduced.offset(10, true)).toBe(0);
  expect(reduced.active).toBe(false);
});

test('skip() settles a pending or running rise without ever starting another', () => {
  const rise = new ArrivalRise();
  rise.skip();
  rise.begin(0, HEIGHT);
  expect(rise.offset(0)).toBe(0);
  expect(rise.started).toBe(true);
});
