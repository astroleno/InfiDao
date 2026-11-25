import { roundRobinCore } from '../../scripts/run-flow-recall-comparison';
import type { PassageRecord } from '@/types';

const row = (id: string): PassageRecord => ({
  id, source: '论语', collection: '经部', chapter: '学而', section: 1, workId: 'lunyu', workTitle: '论语', text: id,
  corpusVersion: 'core', textHash: id,
});

test('keeps the first six, skips overlap and exclusions, and fills in original order', () => {
  const original = Array.from({ length: 10 }, (_, index) => row(`original-${index}`));
  const first = row('first'), second = row('second'), third = row('third'), fourth = row('fourth');
  const result = roundRobinCore(original, [
    [original[0]!, row('excluded'), first, third],
    [first, second, fourth],
  ], new Set(['excluded', original[0]!.id]), original[0]!.id);
  expect(result).toEqual([
    ...original.slice(0, 6), first, second, third, fourth, ...original.slice(6),
  ]);
});

test('stops after 40 records even in the middle of a round', () => {
  const original = Array.from({ length: 7 }, (_, index) => row(`original-${index}`));
  const rankings = ['a', 'b', 'c'].map(prefix => Array.from({ length: 36 }, (_, index) => row(`${prefix}-${index}`)));
  const result = roundRobinCore(original, rankings, new Set());
  expect(result).toHaveLength(40);
  expect(result.slice(-4).map(item => item.id)).toEqual(['a-10', 'b-10', 'c-10', 'a-11']);
  expect(result).not.toContain(original[6]);
});
