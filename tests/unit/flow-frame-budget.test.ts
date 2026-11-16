import { FRAME_BUDGET, FrameBudget, readQualityOverride } from '@/lib/flow-browser/frame-budget';

const feed = (budget: FrameBudget, from: number, until: number, gap: (index: number) => number, fullRate = true) => {
  let time = from, index = 0, changed = false;
  while (time < until) { changed = budget.sample(time, fullRate) || changed; time += gap(index++); }
  return { time, changed };
};

test('a device that keeps its frames stays at full quality', () => {
  const budget = new FrameBudget();
  feed(budget, 0, 20_000, () => 16.7);
  expect(budget.tier).toBe(0);
});

test('a device that keeps missing frames steps down one tier at a time', () => {
  const budget = new FrameBudget();
  const { time } = feed(budget, 0, FRAME_BUDGET.warmupMs + 4000, index => index % 3 ? 16.7 : 33.4);
  expect(budget.tier).toBe(1);
  // The cooldown lets the new tier take effect before judging it.
  feed(budget, time, time + FRAME_BUDGET.cooldownMs - 100, index => index % 3 ? 16.7 : 33.4);
  expect(budget.tier).toBe(1);
  feed(budget, time + FRAME_BUDGET.cooldownMs, time + 20_000, index => index % 3 ? 16.7 : 33.4);
  expect(budget.tier).toBe(FRAME_BUDGET.tiers);
});

test('a steady 30fps on a 60Hz display counts as missing frames', () => {
  const budget = new FrameBudget();
  feed(budget, 0, FRAME_BUDGET.warmupMs + 6000, () => 33.4);
  expect(budget.tier).toBeGreaterThan(0);
});

test('sustained severe foreground stalls still step down through the existing tiers', () => {
  const budget = new FrameBudget();
  feed(budget, 0, 120_000, () => 280);
  expect(budget.tier).toBe(3);
});

test('a 120Hz display reading at its own rate is not mistaken for a slow one', () => {
  const budget = new FrameBudget();
  feed(budget, 0, 20_000, () => 8.33);
  expect(budget.tier).toBe(0);
});

test('warm-up and explicitly interrupted intervals never lower quality', () => {
  const budget = new FrameBudget();
  feed(budget, 0, FRAME_BUDGET.warmupMs - 1, () => 60);
  expect(budget.tier).toBe(0);
  feed(budget, FRAME_BUDGET.warmupMs, 30_000, () => 50, false);
  expect(budget.tier).toBe(0);
  let time = 30_000;
  for (let index = 0; index < 150; index++) {
    budget.sample(time, true);
    budget.sample(time + 16.7, true);
    budget.sample(time + 20, false);
    time += 900;
  }
  expect(budget.tier).toBe(0);
});

test('an explicit quality is held and never adapted', () => {
  const budget = new FrameBudget(2);
  feed(budget, 0, 30_000, () => 50);
  expect(budget.tier).toBe(2);
});

test.each([['?quality=0', 0], ['?quality=3', 3], ['?quality=9', undefined], ['?quality=x', undefined], ['', undefined]])(
  'quality override %s', (search, expected) => { expect(readQualityOverride(search)).toBe(expected); });
