import { IDLE_CADENCE, IdleCadence } from '@/lib/flow-browser/idle-cadence';

test('reading motion keeps every display frame', () => {
  const cadence = new IdleCadence();
  for (let time = 0; time <= 5000; time += 16) cadence.note(time, true);
  expect(cadence.delay(5000)).toBe(0);
});

test('only the ambient water remains: after a settling beat it drifts at a lower rate', () => {
  const cadence = new IdleCadence();
  cadence.note(1000, true);
  cadence.note(1000 + IDLE_CADENCE.settleMs - 1, false);
  expect(cadence.delay(1000 + IDLE_CADENCE.settleMs - 1)).toBe(0);
  cadence.note(1000 + IDLE_CADENCE.settleMs, false);
  expect(cadence.delay(1000 + IDLE_CADENCE.settleMs)).toBe(IDLE_CADENCE.frameMs);
  expect(IDLE_CADENCE.frameMs).toBeGreaterThan(16.7);
  expect(IDLE_CADENCE.frameMs).toBeLessThanOrEqual(66);
});

test('any new motion restores full rate at once', () => {
  const cadence = new IdleCadence();
  cadence.note(0, false);
  expect(cadence.delay(10_000)).toBe(IDLE_CADENCE.frameMs);
  cadence.note(10_016, true);
  expect(cadence.delay(10_016)).toBe(0);
});
