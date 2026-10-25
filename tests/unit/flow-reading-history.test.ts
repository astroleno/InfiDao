/** @jest-environment node */
import { recentReadingsFor, repeatsRecentReflection, retainRecentReadings } from '@/lib/flow/reading-history';
import { FlowError, type FlowFrame } from '@/lib/flow/contracts';
import type { FlowSessionStore, StoredChain } from '@/lib/flow/session-store';

const frame = (id: string, ordinal: number, ready = true) => ({ id, ordinal, ready, source: '论语',
  quote: `原句${id}`, reflection: `只在${id}提出的新区别` } as FlowFrame);
const state = (id: string, nodes: FlowFrame[], parentChainId: string | null = null) => ({ owner: 'owner',
  chain: { chainId: id, parentChainId }, nodes: Object.fromEntries(nodes.map(node => [node.id, node])) } as StoredChain);
const store = (getChain = jest.fn()) => ({ getChain } as unknown as FlowSessionStore);

test('retains the latest three distinct explanations with bounded Unicode-safe fields', () => {
  const readings = ['a', 'b', 'c', 'd'].map(id => ({ source: '论语', quote: id, reflection: `区别${id}` }));
  expect(retainRecentReadings([...readings, readings[1]!]).map(reading => reading.quote)).toEqual(['c', 'd', 'b']);
  const [long] = retainRecentReadings([{ source: '论语', quote: '字'.repeat(79) + '𠮷', reflection: '字'.repeat(359) + '𠮷' }]);
  expect(long!.quote.length).toBeLessThanOrEqual(80); expect(long!.reflection.length).toBeLessThanOrEqual(360);
  expect(long!.quote + long!.reflection).not.toMatch(/[\uD800-\uDBFF]$/u);
});

test('only completed paragraphs through the actively chosen frame enter a branch', async () => {
  const root = state('root', [frame('later', 3), frame('chosen', 2), frame('first', 1), frame('pending', 4, false)]);
  root.recentReadings = [{ source: '大学', quote: '更早原文', reflection: '更早区别' }];
  const backend = store();
  const readings = await recentReadingsFor(root, 'owner', backend, frame('chosen', 2));
  expect(readings.map(reading => reading.quote)).toEqual(['更早原文', '原句first', '原句chosen']);
  expect(backend.getChain).not.toHaveBeenCalled();
});

test('continuation includes the latest completed paragraph but excludes a pending head', async () => {
  const current = state('current', [frame('a', 1), frame('b', 2), frame('pending', 3, false)]);
  current.recentReadings = [{ source: '大学', quote: '来路', reflection: '来路区别' }];
  expect((await recentReadingsFor(current, 'owner', store())).map(reading => reading.quote)).toEqual(['来路', '原句a', '原句b']);
});

test('legacy ancestry uses the same owner, stops at three useful readings and tolerates expired ancestors', async () => {
  const root = state('root', [frame('a', 1)]), child = state('child', [frame('b', 1)], 'root');
  const grandchild = state('grandchild', [frame('c', 1)], 'child');
  const parents: Record<string, StoredChain> = { root, child };
  const getChain = jest.fn(async (_owner: string, id: string) => parents[id]!);
  expect((await recentReadingsFor(grandchild, 'owner', store(getChain))).map(reading => reading.quote)).toEqual(['原句a', '原句b', '原句c']);
  expect(getChain.mock.calls).toEqual([['owner', 'child'], ['owner', 'root']]);
  getChain.mockRejectedValueOnce(new FlowError('CHAIN_EXPIRED', '已过期', 410));
  expect((await recentReadingsFor(child, 'owner', store(getChain))).map(reading => reading.quote)).toEqual(['原句b']);
});

test('a missing store or owner validation is never swallowed as missing ancestry', async () => {
  const backend = store(jest.fn().mockRejectedValue(new FlowError('STORE_UNAVAILABLE', '不可用', 503)));
  await expect(recentReadingsFor(state('child', [frame('b', 1)], 'root'), 'owner', backend)).rejects.toMatchObject({ code: 'STORE_UNAVAILABLE' });
});

test('legacy recovery follows each branch entry without inheriting later unchosen paragraphs', async () => {
  const root = state('root', [frame('first', 1), frame('chosen', 2), frame('unselected', 3)]);
  const child = state('child', [frame('child', 1)], 'root');
  child.chain.entry = { fromFrameId: 'chosen', anchorId: 'word', label: '义' };
  const readings = await recentReadingsFor(child, 'owner', store(jest.fn().mockResolvedValue(root)));
  expect(readings.map(reading => reading.quote)).toEqual(['原句first', '原句chosen', '原句child']);
});

test('near-copied advice is rejected while a new distinction on the same topic remains readable', () => {
  const recent = [{ source: '孟子', quote: '旧句', reflection: '舜的难处不在不懂法，而在守法与护父无法两全。今天面对职责与亲近的冲突，也可先承认代价真实存在，再问自己愿意承担哪一种后果，而不是假装两件事都能兼顾。' }];
  expect(repeatsRecentReflection('孟子先立人伦之大，再让舜在守法与护父间承受两难。今天面对职责与亲近的冲突，可先承认代价真实，再问自己愿承担哪一种后果。', recent)).toBe(true);
  expect(repeatsRecentReflection('职责与亲近发生冲突时，还能区分以职权徇私和退出职位后的个人担当；放弃权位本身就是代价，不能把退出说成毫无损失的两全。', recent)).toBe(false);
  expect(repeatsRecentReflection('职责与亲近', recent)).toBe(false);
});
