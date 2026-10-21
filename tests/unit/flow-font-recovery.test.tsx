import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WheelCanvas } from '@/components/flow/WheelCanvas';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';
import { createFlowRendererHost } from '@/lib/flow-browser/renderer-host';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { ReadingSnapshot } from '@/lib/flow-browser/storage';
jest.mock('@/lib/flow-browser/fonts', () => ({ prepareFlowFonts: jest.fn() }));
jest.mock('@/lib/flow-browser/renderer-host', () => ({ createFlowRendererHost: jest.fn() }));
beforeEach(() => jest.resetAllMocks());

test('font retry preserves the current quotation and creates the renderer without reloading the page', async () => {
  const frame = { id: 'f', quote: '物有本末，事有终始。', fullText: '物有本末，事有终始。' } as FlowFrame;
  const onPauseChange = jest.fn(), destroy = jest.fn();
  jest.mocked(prepareFlowFonts).mockRejectedValueOnce(new Error('FONT_TIMEOUT'));
  let finish!: (value: Awaited<ReturnType<typeof prepareFlowFonts>>) => void;
  jest.mocked(prepareFlowFonts).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  jest.mocked(createFlowRendererHost).mockImplementation((_, __, ___, options) => {
    options.callbacks.onReady?.();
    return { destroy, setFrames: jest.fn(), setPaused: jest.fn(), setReducedMotion: jest.fn() } as unknown as ReturnType<typeof createFlowRendererHost>;
  });
  const { unmount } = render(<WheelCanvas frames={[frame]} chainId="original-chain" paused reducedMotion={false} snapshot={{ paused: false } as ReadingSnapshot}
    onSelect={jest.fn()} onPauseChange={onPauseChange} onActiveChange={jest.fn()} onSnapshot={jest.fn()} onHostReady={jest.fn()} />);
  const retry = await screen.findByRole('button', { name: '重试字体' });
  expect(screen.getByText(frame.quote)).toBeInTheDocument();
  act(() => retry.focus()); fireEvent.click(retry);
  expect(screen.getByRole('button', { name: '正在载入字体…' })).toBeDisabled();
  expect(screen.getByText(frame.quote)).toBeInTheDocument();
  await act(async () => finish({ version: 'v1', family: 'test-serif', families: [], characters: frame.quote }));
  await waitFor(() => expect(createFlowRendererHost).toHaveBeenCalledTimes(1));
  expect(jest.mocked(createFlowRendererHost).mock.calls[0]![3].snapshot?.paused).toBe(true);
  expect(prepareFlowFonts).toHaveBeenNthCalledWith(2, [{ quote: frame.quote }]);
  expect(onPauseChange).toHaveBeenCalledWith(true);
  expect(screen.queryByRole('button', { name: '重试字体' })).not.toBeInTheDocument();
  expect(document.activeElement?.tagName).toBe('CANVAS');
  unmount(); expect(destroy).toHaveBeenCalledTimes(1);
});

test('late initial glyphs preserve the reader pause and active frame without a constructor rewind', async () => {
  const first = { id: 'first', quote: '物有本末。' } as FlowFrame;
  const second = { id: 'second', quote: '知所先后。' } as FlowFrame;
  const frames = [first, second];
  let finish!: (value: Awaited<ReturnType<typeof prepareFlowFonts>>) => void;
  jest.mocked(prepareFlowFonts).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const focusFrame = jest.fn(), onActiveChange = jest.fn();
  jest.mocked(createFlowRendererHost).mockImplementation((_, __, ___, options) => {
    options.callbacks.onActiveChange(first);
    return { destroy: jest.fn(), focusFrame, setPaused: jest.fn(), setReducedMotion: jest.fn() } as unknown as ReturnType<typeof createFlowRendererHost>;
  });
  const props = { frames, active: first, chainId: 'chain', paused: false, reducedMotion: false,
    snapshot: { paused: false, activeFrameId: first.id } as ReadingSnapshot,
    onSelect: jest.fn(), onPauseChange: jest.fn(), onActiveChange, onSnapshot: jest.fn(), onHostReady: jest.fn() };
  const view = render(<WheelCanvas {...props} />);
  view.rerender(<WheelCanvas {...props} active={second} paused />);
  await act(async () => finish({ version: 'v1', family: 'serif', families: [], characters: '' }));
  expect(createFlowRendererHost).toHaveBeenCalledTimes(1);
  expect(jest.mocked(createFlowRendererHost).mock.calls[0]![3].snapshot?.paused).toBe(true);
  expect(focusFrame).toHaveBeenCalledWith(second.id);
  expect(onActiveChange).not.toHaveBeenCalled();
  view.unmount();
});

test('appended text is installed into the canvas only after its own glyphs are ready', async () => {
  const first = { id: 'first', quote: '物有本末。' } as FlowFrame;
  const second = { id: 'second', quote: '知所先后。' } as FlowFrame;
  const ready = { version: 'v1', family: 'serif', families: [], characters: '' };
  const setFrames = jest.fn();
  jest.mocked(prepareFlowFonts).mockResolvedValueOnce(ready);
  jest.mocked(createFlowRendererHost).mockReturnValue({ destroy: jest.fn(), setFrames, setPaused: jest.fn(), setReducedMotion: jest.fn() } as unknown as ReturnType<typeof createFlowRendererHost>);
  const props = { frames: [first], active: first, chainId: 'chain', paused: true, reducedMotion: false,
    onSelect: jest.fn(), onPauseChange: jest.fn(), onActiveChange: jest.fn(), onSnapshot: jest.fn(), onHostReady: jest.fn() };
  const view = render(<WheelCanvas {...props} />);
  await waitFor(() => expect(createFlowRendererHost).toHaveBeenCalledTimes(1));
  let finish!: (value: typeof ready) => void;
  jest.mocked(prepareFlowFonts).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const appended = [first, second];
  view.rerender(<WheelCanvas {...props} frames={appended} active={second} />);
  expect(setFrames).not.toHaveBeenCalled();
  await act(async () => finish(ready));
  expect(setFrames).toHaveBeenCalledWith(appended, second.id);
  view.unmount();
});
