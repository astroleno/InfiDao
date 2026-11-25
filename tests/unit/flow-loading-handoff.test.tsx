import { act, renderHook } from '@testing-library/react';
import { QUOTE_FADE_MS, QUOTE_HOLD_MS, useLoadingHandoff } from '@/components/flow/useLoadingHandoff';

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

test('the lettering is revealed only after the quotation has left, never beneath it', () => {
  const view = renderHook(() => useLoadingHandoff('物有本末。', false));
  act(() => { jest.advanceTimersByTime(QUOTE_HOLD_MS + 50); });
  act(() => view.result.current.markVisualReady());
  expect(view.result.current.ready).toBe(true);
  expect(view.result.current.revealed).toBe(false);
  act(() => { jest.advanceTimersByTime(QUOTE_FADE_MS - 1); });
  expect(view.result.current.revealed).toBe(false);
  act(() => { jest.advanceTimersByTime(1); });
  expect(view.result.current.revealed).toBe(true);
});

test.each([['', false], ['物有本末。', true]])('without a visible quotation (%s, reduced %s) reveal is immediate', (quote, reducedMotion) => {
  const view = renderHook(() => useLoadingHandoff(quote, reducedMotion));
  act(() => view.result.current.markVisualReady());
  expect(view.result.current.revealed).toBe(true);
});

test('native lettering takes over immediately while the centered quotation is on hold', () => {
  const view = renderHook(() => useLoadingHandoff('物有本末。', false));
  act(() => view.result.current.markVisualReady('canvas'));
  expect(view.result.current.ready).toBe(false);
  act(() => view.result.current.markVisualReady('native'));
  expect(view.result.current).toMatchObject({ ready: true, revealed: true, immediate: true });
  expect(jest.getTimerCount()).toBe(0);
});

test.each([0, QUOTE_HOLD_MS])('enabling reduced motion after %d ms permanently skips the rest of the quotation', elapsed => {
  const view = renderHook(({ reducedMotion }) => useLoadingHandoff('物有本末。', reducedMotion), {
    initialProps: { reducedMotion: false },
  });
  act(() => view.result.current.markVisualReady('canvas'));
  act(() => { jest.advanceTimersByTime(elapsed); });
  expect(view.result.current).toMatchObject({ ready: elapsed >= QUOTE_HOLD_MS, revealed: false, immediate: false });
  expect(jest.getTimerCount()).toBe(1);

  view.rerender({ reducedMotion: true });
  expect(view.result.current).toMatchObject({ ready: true, revealed: true, immediate: true });
  expect(jest.getTimerCount()).toBe(0);

  view.rerender({ reducedMotion: false });
  expect(view.result.current).toMatchObject({ ready: true, revealed: true, immediate: true });
  expect(jest.getTimerCount()).toBe(0);
});
