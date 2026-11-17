import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { readingStorage, type FlowPathRecord } from '@/lib/flow-browser/storage';

const mockRecord: FlowPathRecord = {
  pathId: 'retry-root', parentPathId: null, sourceLabel: '大学', createdAt: 1, updatedAt: 1,
  chain: { chainId: 'retry-chain', kind: 'remote', exhausted: false, cursor: 'c1', frames: [{ id: 'first', quote: '知止。', fullText: '知止。', source: '大学', chapterLabel: '经一章', quoteStart: 0, quoteEnd: 3 }] },
  snapshot: { version: 1, position: 0, rowOffset: 0, ambientPhase: 0, paused: false, sourceOpen: false, activeFrameId: 'first', readingPositions: {}, ribbon: null },
} as FlowPathRecord;

const mockRetry = jest.fn(async () => {});
let mockHost: any;
jest.mock('@/lib/flow-browser/controller-host', () => ({
  createBrowserController: (host: any) => {
    mockHost = host;
    return {
      async start() {
        await host.present(mockRecord, { current: () => true, navigation: 'replace' });
        host.state({ record: mockRecord, busy: false, pending: false, error: null, storageWarning: false });
      },
      retry: mockRetry, getState: () => ({ record: mockRecord }),
      checkpoint: async () => {}, dispose() {}, setVisible() {}, cancelPreparation() {},
    };
  },
}));
jest.mock('@/components/flow/FlowStream', () => ({ FlowStream: (props: any) => {
  const React = require('react');
  const ready = React.useRef(props.onVisualReady);
  React.useEffect(() => { ready.current(); }, []);
  // Any press inside the stream holds the reading still, including a press
  // that lands on the error's own buttons.
  return <section data-testid="stream" data-paused={String(props.paused)} onPointerDown={() => props.onPause()}>{props.waiting}</section>;
} }));
jest.mock('@/components/flow/FlowLoading', () => ({ FlowLoading: () => null }));
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
