import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { QUOTE_HOLD_MS } from '@/components/flow/useLoadingHandoff';
import { readingStorage, type FlowPathRecord } from '@/lib/flow-browser/storage';

const mockRecord: FlowPathRecord = {
  pathId: 'retry-root', parentPathId: null, sourceLabel: '大学', createdAt: 1, updatedAt: 1,
  chain: { chainId: 'retry-chain', kind: 'remote', exhausted: false, cursor: 'c1', frames: [{ id: 'first', quote: '知止。', fullText: '知止。', source: '大学', chapterLabel: '经一章', quoteStart: 0, quoteEnd: 3 }] },
  snapshot: { version: 1, position: 0, rowOffset: 0, ambientPhase: 0, paused: false, sourceOpen: false, activeFrameId: 'first', readingPositions: {}, ribbon: null },
} as FlowPathRecord;

const mockSelection = { pathId: mockRecord.pathId, frameId: 'first', anchorId: 'text:1:2', label: '止',
  selection: { start: 1, end: 2, textHash: 'first', corpusVersion: 'v1' } };
const mockChild: FlowPathRecord = {
  ...mockRecord, pathId: 'retry-child', parentPathId: mockRecord.pathId,
  parentEntry: { fromFrameId: mockSelection.frameId, anchorId: mockSelection.anchorId,
    label: mockSelection.label, selection: mockSelection.selection },
  chain: { ...mockRecord.chain, chainId: 'retry-child-chain', frames: [
    { ...mockRecord.chain.frames[0]!, id: 'second', quote: '本末。', fullText: '本末。', ready: false },
  ] },
};
jest.mock('@/lib/flow-browser/storage', () => ({
  ...jest.requireActual('@/lib/flow-browser/storage'),
  loadPath: async (id: string) => id === mockRecord.pathId ? mockRecord : null,
}));

const mockRetry = jest.fn(async () => {});
let mockHost: any;
let mockVisualReady: (surface: 'native' | 'canvas') => void;
jest.mock('@/lib/flow-browser/controller-host', () => ({
  createBrowserController: (host: any) => {
    mockHost = host;
    return {
      async start() {
        await host.present(mockRecord, { current: () => true, navigation: 'replace' });
        host.state({ record: mockRecord, busy: false, pending: false, error: null, storageWarning: false });
      },
      retry: mockRetry, branch: async () => {}, getState: () => ({ record: mockRecord }),
      checkpoint: async () => {}, dispose() {}, setVisible() {}, cancelPreparation() {},
    };
  },
}));
jest.mock('@/components/flow/FlowStream', () => ({ FlowStream: (props: any) => {
  mockVisualReady = props.onVisualReady;
  // Any press inside the stream holds the reading still, including a press
  // that lands on the error's own buttons.
  return <section data-testid="stream" data-paused={String(props.paused)} onPointerDown={() => props.onPause()}>
    <button type="button" onClick={() => void props.onBranch(mockSelection)}>止</button>
    {props.waiting}{props.firstHint}
  </section>;
} }));
jest.mock('@/components/flow/SeedSheet', () => ({ SeedSheet: () => null }));

const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const media = (matches: boolean) => Object.defineProperty(window, 'matchMedia', { configurable: true,
  value: () => ({ matches, addEventListener() {}, removeEventListener() {} }) });
beforeEach(() => {
  mockRetry.mockClear();
  media(false);
  jest.spyOn(readingStorage, 'hintSeen').mockResolvedValue(true);
  jest.spyOn(readingStorage, 'listBookmarks').mockResolvedValue([]);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});

async function failContinuation() {
  render(<FlowExperience />);
  await waitFor(() => expect(screen.getByTestId('stream')).toBeInTheDocument());
  act(() => mockHost.state({ record: mockRecord, busy: false, pending: false, storageWarning: false,
    error: { code: 'RELATION_UNVERIFIED', message: '这次生成的联系未通过核验，可以换个词，或重试。' } }));
  const retry = await screen.findByRole('button', { name: '重试' });
  fireEvent.pointerDown(retry);
  expect(screen.getByTestId('stream')).toHaveAttribute('data-paused', 'true');
  fireEvent.click(retry);
}

test('retrying a failed continuation lets the reading flow on instead of leaving it held at the end', async () => {
  await failContinuation();
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('stream')).toHaveAttribute('data-paused', 'false');
});

test('with reduced motion a retry never starts automatic movement', async () => {
  media(true);
  await failContinuation();
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('stream')).toHaveAttribute('data-paused', 'true');
});

test('the first hint waits for the outgoing overlay, yields to connection status, and remembers dismissal', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(readingStorage.hintSeen).mockResolvedValue(false);
    const dismiss = jest.spyOn(readingStorage, 'dismissHint').mockResolvedValue({ persisted: true });
    const view = render(<FlowExperience />);
    await screen.findByText('知止。', { selector: 'p' });
    act(() => mockVisualReady('canvas'));
    act(() => jest.advanceTimersByTime(QUOTE_HOLD_MS));
    expect(view.container.querySelector('[data-phase="focus"]')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();

    const state = { record: mockRecord, busy: false, error: null, storageWarning: false };
    act(() => mockHost.state({ ...state, pending: true }));
    act(() => jest.advanceTimersByTime(200));
    expect(view.container.querySelector('[data-phase="focus"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();
    act(() => mockHost.state({ ...state, pending: false, error: { code: 'RELATION_UNVERIFIED', message: '联系待核对。' } }));
    expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();
    act(() => mockHost.state({ ...state, pending: false }));
    expect(screen.getByText('点空白停驻，点词接续。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    act(() => mockHost.state({ ...state, pending: true }));
    act(() => mockHost.state({ ...state, pending: false }));
    expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();
    view.unmount();
  } finally { jest.useRealTimers(); }
});

test('native reduced-motion reveal provides only usable reading gestures', async () => {
  media(true);
  jest.mocked(readingStorage.hintSeen).mockResolvedValue(false);
  render(<FlowExperience />);
  await screen.findByText('知止。', { selector: 'p' });
  act(() => mockVisualReady('native'));
  expect(screen.queryByText('知止。', { selector: 'p' })).not.toBeInTheDocument();
  expect(screen.getByText('上下滑动阅读，点词接续。')).toBeInTheDocument();
});

test.each([false, true])('a verified word continuation consumes the hint before completion (late read: %s)', async late => {
  media(true);
  let resolveHint = () => {};
  const hintSeen = jest.mocked(readingStorage.hintSeen);
  if (late) hintSeen.mockReturnValue(new Promise(resolve => { resolveHint = () => resolve(false); }));
  else hintSeen.mockResolvedValue(false);
  const dismiss = jest.spyOn(readingStorage, 'dismissHint').mockResolvedValue({ persisted: true });
  render(<FlowExperience />);
  await screen.findByText('知止。', { selector: 'p' });
  act(() => mockVisualReady('native'));
  if (!late) expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument();

  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '止' })); });
  const state = { record: mockChild, busy: false, pending: true, error: null, storageWarning: false };
  act(() => mockHost.state(state));
  expect(dismiss).not.toHaveBeenCalled();
  await act(async () => { await mockHost.present(mockChild, { current: () => true, navigation: 'push' }); });
  expect(dismiss).toHaveBeenCalledTimes(1);
  await act(async () => { resolveHint(); });
  act(() => mockHost.state({ ...state, pending: false }));
  expect(screen.queryByRole('button', { name: '知道了' })).not.toBeInTheDocument();
});
