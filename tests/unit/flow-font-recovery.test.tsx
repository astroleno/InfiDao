import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WheelCanvas } from '@/components/flow/WheelCanvas';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';
import { createFlowRendererHost } from '@/lib/flow-browser/renderer-host';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { ReadingSnapshot } from '@/lib/flow-browser/storage';
jest.mock('@/lib/flow-browser/fonts', () => ({ prepareFlowFonts: jest.fn() }));
jest.mock('@/lib/flow-browser/renderer-host', () => ({ createFlowRendererHost: jest.fn() }));

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
  expect(prepareFlowFonts).toHaveBeenNthCalledWith(2, [frame]);
  expect(onPauseChange).toHaveBeenCalledWith(true);
  expect(screen.queryByRole('button', { name: '重试字体' })).not.toBeInTheDocument();
  expect(document.activeElement?.tagName).toBe('CANVAS');
  unmount(); expect(destroy).toHaveBeenCalledTimes(1);
});
