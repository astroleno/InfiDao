import { readCompareOptions } from '@/components/flow/motion-compare-options';

test('a recording stage can pin the seed, start playing and choose speed and layout', () => {
  expect(readCompareOptions('?seed=42.5&play=1&speed=12&view=compare')).toEqual({ seed: 42.5, play: true, speed: 12, single: false });
});

test('ordinary visits keep the page defaults', () => {
  expect(readCompareOptions('')).toEqual({ seed: undefined, play: false, speed: 36, single: true });
});

test.each(['?seed=abc', '?seed=-1', '?seed=300', '?speed=999', '?speed=0'])('invalid values fall back safely (%s)', search => {
  const options = readCompareOptions(search);
  expect(options.seed === undefined || (options.seed >= 0 && options.seed < 289)).toBe(true);
  expect([12, 36, 72]).toContain(options.speed);
});
