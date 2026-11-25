import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { readingStorage, type FlowPathRecord } from '@/lib/flow-browser/storage';
import type { createBrowserController, ControllerState } from '@/lib/flow-browser/controller-host';

const mockRecord: FlowPathRecord = {
  pathId: 'feedback-root', parentPathId: null, sourceLabel: '大学', createdAt: 1, updatedAt: 1,
  chain: { chainId: 'feedback-chain', kind: 'remote', exhausted: true, frames: [{ id: 'first', quote: '知止。', fullText: '知止。', source: '大学', chapterLabel: '经一章', quoteStart: 0, quoteEnd: 3 }] },
  snapshot: { version: 1, position: 0, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, activeFrameId: 'first', readingPositions: {}, ribbon: null },
};
const mockWord = { start: 1, end: 2, textHash: 'first', corpusVersion: 'v1' };
let mockPresent: Parameters<typeof createBrowserController>[0]['present'];
let mockState: Parameters<typeof createBrowserController>[0]['state'];
const mockCancel = jest.fn();
const mockRestart = jest.fn(async () => {});
const mockControllerState: ControllerState = { record: mockRecord, busy: false, pending: false, error: null, storageWarning: false, version: 1 };

jest.mock('@/lib/flow-browser/controller-host', () => ({
  createBrowserController: (host: Parameters<typeof createBrowserController>[0]) => ({
    async start() {
      mockPresent = host.present;
      mockState = host.state;
      await host.present(mockRecord, { current: () => true, navigation: 'replace' });
      host.state(mockControllerState);
    },
    branch: () => new Promise(() => {}), cancel: mockCancel, getState: () => mockControllerState, restart: mockRestart,
    checkpoint: async () => {}, dispose() {}, setVisible() {}, cancelPreparation() {},
  }),
}));
jest.mock('@/lib/flow-browser/storage', () => ({
  ...jest.requireActual('@/lib/flow-browser/storage'),
  loadPath: async (pathId: string) => pathId === mockRecord.pathId ? mockRecord : null,
}));
jest.mock('@/components/flow/FlowStream', () => ({ FlowStream: (props: any) => {
  const React = require('react');
  const ready = React.useRef(props.onVisualReady);
  React.useEffect(() => { ready.current(); }, []);
  return <>
    <button type="button" onClick={props.onBookmark}>收藏样例</button>
    <button type="button" onClick={() => props.onBranch({ pathId: mockRecord.pathId, frameId: 'first', selection: mockWord, label: '止' })}>点原文字词</button>
    <button type="button" onClick={() => props.onBranch({ pathId: mockRecord.pathId, frameId: 'first', anchorId: 'anchor', label: '知' })}>点锚点</button>
    <button type="button" onClick={props.navigation.onLibrary}>打开温故</button>
    <button type="button" onClick={props.navigation.poetry.onToggle}>切换诗词范围</button>
    <output aria-label="接续来路">{props.arrival ? `${props.arrival.kind || 'ordinary'}:${props.arrival.label}` : ''}</output>
    {props.waiting}
  </>;
} }));
jest.mock('@/components/flow/FlowLoading', () => ({ FlowLoading: () => null }));
jest.mock('@/components/flow/SeedSheet', () => ({ SeedSheet: () => null }));

const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  jest.spyOn(readingStorage, 'hintSeen').mockResolvedValue(true);
  jest.spyOn(readingStorage, 'listBookmarks').mockResolvedValue([]);
  jest.spyOn(readingStorage, 'getBookmark').mockResolvedValue(null);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});

test('visible collection feedback waits for the persistence result', async () => {
  let finish!: (result: { persisted: boolean }) => void;
  jest.spyOn(readingStorage, 'saveBookmark').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '收藏样例' }));
  await waitFor(() => expect(readingStorage.saveBookmark).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status', { name: '收藏状态' })).toBeEmptyDOMElement();
  await act(async () => { finish({ persisted: true }); });
  expect(screen.getByRole('status', { name: '收藏状态' })).toHaveTextContent('已收藏');
  expect(screen.getByRole('status', { name: '收藏状态' })).toHaveAttribute('data-visible', 'true');
});

test('a session-only write never claims durable collection success', async () => {
  jest.spyOn(readingStorage, 'saveBookmark').mockResolvedValue({ persisted: false, error: new Error('quota') });
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '收藏样例' }));
  await waitFor(() => expect(screen.getByRole('status', { name: '收藏状态' })).toHaveTextContent('收藏仅本次可用'));
  expect(screen.getByRole('status', { name: '收藏状态' })).not.toHaveTextContent('已收藏');
});

test('storage errors are caught and give retry feedback', async () => {
  jest.spyOn(readingStorage, 'saveBookmark').mockRejectedValue(new Error('disk'));
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '收藏样例' }));
  await waitFor(() => expect(screen.getByRole('status', { name: '收藏状态' })).toHaveTextContent('收藏未成功，请重试。'));
});

test('a session-only cancellation explains that the bookmark can return after refresh', async () => {
  jest.spyOn(readingStorage, 'getBookmark').mockResolvedValue({ key: 'saved' } as any);
  jest.spyOn(readingStorage, 'deleteBookmark').mockResolvedValue({ persisted: false, error: new Error('quota') });
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '收藏样例' }));
  await waitFor(() => expect(screen.getByRole('status', { name: '收藏状态' })).toHaveTextContent('取消仅本次生效，刷新后可能恢复，请稍后重试。'));
  expect(screen.getByRole('status', { name: '收藏状态' })).not.toHaveTextContent('已取消收藏');
});

test.each([
  { trigger: '点原文字词', anchorId: 'text:1:2', selection: mockWord, expected: 'word:沿「止」已接续' },
  { trigger: '点锚点', anchorId: 'anchor', expected: 'word:沿「知」已接续' },
  { trigger: '点原文字词', anchorId: 'text:0:1', selection: { ...mockWord, start: 0, end: 1 }, expected: 'ordinary:经文已接续' },
  { trigger: '点锚点', anchorId: 'next:cursor', expected: 'ordinary:经文已接续' },
  { trigger: '点原文字词', anchorId: 'text:1:2', selection: mockWord, cancel: true, expected: 'ordinary:沿「止」已接续' },
])('checks the selected route before tagging an arrival ($expected)', async testCase => {
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: testCase.trigger }));
  if (testCase.cancel) {
    act(() => mockState({ ...mockControllerState, pending: true, busy: true }));
    fireEvent.click(screen.getByRole('button', { name: '停止展开' }));
    expect(mockCancel).toHaveBeenCalled();
  }
  const output: FlowPathRecord = {
    ...mockRecord, pathId: 'feedback-child', parentPathId: mockRecord.pathId,
    parentEntry: { fromFrameId: 'first', anchorId: testCase.anchorId, label: '止',
      ...(testCase.selection ? { selection: testCase.selection } : {}) },
  };
  await act(async () => { await mockPresent(output, { current: () => true, navigation: 'push' }); });
  expect(screen.getByLabelText('接续来路')).toHaveTextContent(testCase.expected);
});

test.each(['打开温故', '切换诗词范围'])('an expired word branch retains its exact restart selection after %s', async action => {
  mockRestart.mockClear();
  render(<FlowExperience />);
  await waitFor(() => expect(readingStorage.listBookmarks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: '点原文字词' }));
  act(() => mockState({ ...mockControllerState, error: { code: 'CHAIN_EXPIRED', message: '这条联系已过期。' } }));
  expect(screen.getByRole('button', { name: '沿此词重新展开' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: action }));
  if (action === '打开温故') {
    const close = screen.getByRole('button', { name: '返回阅读' });
    await act(async () => { fireEvent.click(close); });
  }
  fireEvent.click(screen.getByRole('button', { name: '沿此词重新展开' }));
  expect(mockRestart.mock.calls).toEqual([[{ pathId: mockRecord.pathId, frameId: 'first', selection: mockWord, label: '止' }]]);
  const restored: FlowPathRecord = {
    ...mockRecord, pathId: 'restarted-word', parentPathId: mockRecord.pathId,
    parentEntry: { fromFrameId: 'first', anchorId: 'text:1:2', selection: mockWord, label: '止' },
  };
  await act(async () => { await mockPresent(restored, { current: () => true, navigation: 'push' }); });
  expect(screen.getByLabelText('接续来路')).toHaveTextContent('ordinary:沿「止」已接续');
});
