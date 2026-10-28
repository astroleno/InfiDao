import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { readingStorage, type FlowPathRecord } from '@/lib/flow-browser/storage';

const mockRecord: FlowPathRecord = {
  pathId: 'feedback-root', parentPathId: null, sourceLabel: '大学', createdAt: 1, updatedAt: 1,
  chain: { chainId: 'feedback-chain', kind: 'remote', exhausted: true, frames: [{ id: 'first', quote: '知止。', fullText: '知止。', source: '大学', chapterLabel: '经一章', quoteStart: 0, quoteEnd: 3 }] },
  snapshot: { version: 1, position: 0, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, activeFrameId: 'first', readingPositions: {}, ribbon: null },
};

jest.mock('@/lib/flow-browser/controller-host', () => ({
  createBrowserController: (host: any) => ({
    async start() {
      await host.present(mockRecord, { current: () => true, navigation: 'replace' });
      host.state({ record: mockRecord, busy: false, pending: false, error: null, storageWarning: false });
    },
    checkpoint: async () => {}, dispose() {}, setVisible() {}, cancelPreparation() {},
  }),
}));
jest.mock('@/components/flow/FlowStream', () => ({ FlowStream: (props: any) => {
  const React = require('react');
  const ready = React.useRef(props.onVisualReady);
  React.useEffect(() => { ready.current(); }, []);
  return <button type="button" onClick={props.onBookmark}>收藏样例</button>;
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
