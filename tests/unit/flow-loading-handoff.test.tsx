import { act, renderHook } from '@testing-library/react';
import { QUOTE_HOLD_MS, useLoadingHandoff } from '@/components/flow/useLoadingHandoff';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a quotation that just arrived holds the light for one full beat', () => {
  const view = renderHook(({ quote }) => useLoadingHandoff(quote, false), { initialProps: { quote: '' } });
  view.rerender({ quote: '物有本末，事有终始。' });
  act(() => { jest.advanceTimersByTime(100); });
  act(() => view.result.current.markVisualReady());
  expect(view.result.current.ready).toBe(false);
  act(() => { jest.advanceTimersByTime(QUOTE_HOLD_MS - 101); });
  expect(view.result.current.ready).toBe(false);
  act(() => { jest.advanceTimersByTime(1); });
  expect(view.result.current.ready).toBe(true);
});

test('a quotation already seen for a beat hands off at once', () => {
  const view = renderHook(() => useLoadingHandoff('物有本末。', false));
  act(() => { jest.advanceTimersByTime(QUOTE_HOLD_MS + 50); });
  act(() => view.result.current.markVisualReady());
  expect(view.result.current.ready).toBe(true);
});

test.each([
  ['without a quotation', '', false],
  ['under reduced motion', '物有本末。', true],
])('%s the handoff is immediate', (_, quote, reducedMotion) => {
  const view = renderHook(() => useLoadingHandoff(quote, reducedMotion));
  act(() => view.result.current.markVisualReady());
  expect(view.result.current.ready).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('readiness is final once reached', () => {
  const view = renderHook(({ quote }) => useLoadingHandoff(quote, false), { initialProps: { quote: '' } });
  act(() => view.result.current.markVisualReady());
  view.rerender({ quote: '新的一句。' });
  expect(view.result.current.ready).toBe(true);
});
