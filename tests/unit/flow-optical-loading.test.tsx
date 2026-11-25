import { act, render, screen } from '@testing-library/react';
import { FlowLoading } from '@/components/flow/FlowLoading';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
const props = { active: true, progress: { phase: 'manifest' as const, loaded: 0, total: 0 }, quote: '', reducedMotion: false };

test('keeps waiting for the renderer after fonts arrive, then hands the actual quotation to the scene', () => {
  const view = render(<FlowLoading {...props} />);
  expect(screen.getByRole('status')).toHaveTextContent('正在取来经文');
  act(() => jest.advanceTimersByTime(500));
  view.rerender(<FlowLoading {...props} progress={{ phase: 'ready', loaded: 2, total: 2 }} quote="物有本末，事有终始。" />);
  expect(view.container.firstChild).toHaveAttribute('data-phase', 'ready');
  expect(view.container.firstChild).toHaveAttribute('data-has-quote', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('经文已到，即将呈现');
  view.rerender(<FlowLoading {...props} active={false} progress={{ phase: 'ready', loaded: 2, total: 2 }} quote="物有本末，事有终始。" />);
  expect(view.container.firstChild).toHaveAttribute('data-phase', 'focus');
  expect(screen.getByText('物有本末，事有终始。')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(480));
  expect(view.container).toBeEmptyDOMElement();
});

test.each(['manifest', 'fonts', 'ready'] as const)('without a quote, %s still reports waiting for the text', phase => {
  const view = render(<FlowLoading {...props} progress={{ phase, loaded: 1, total: 2 }} />);
  expect(screen.getByRole('status')).toHaveTextContent('正在取来经文');
  if (phase === 'fonts') {
    view.rerender(<FlowLoading {...props} progress={{ phase, loaded: 1, total: 2 }} quote="物有本末。" />);
    expect(screen.getByRole('status')).toHaveTextContent('正在准备字形');
  }
});

test('a native handoff removes the old quotation in the same render even during the optical fade', () => {
  const onVisibilityChange = jest.fn();
  const all = { ...props, quote: '物有本末。', onVisibilityChange };
  const view = render(<FlowLoading {...all} />);
  act(() => jest.advanceTimersByTime(300));
  view.rerender(<FlowLoading {...all} active={false} />);
  expect(view.container.firstChild).toHaveAttribute('data-phase', 'focus');
  expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  view.rerender(<FlowLoading {...all} active={false} immediate />);
  expect(view.container).toBeEmptyDOMElement();
  expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([false, true])('cache hits and reduced motion (%s) do not impose a handoff delay', reducedMotion => {
  const view = render(<FlowLoading {...props} reducedMotion={reducedMotion} />);
  view.rerender(<FlowLoading {...props} active={false} reducedMotion={reducedMotion} />);
  expect(view.container).toBeEmptyDOMElement(); expect(jest.getTimerCount()).toBe(0);
});

test('a new pending operation cancels an old fadeout timer', () => {
  const view = render(<FlowLoading {...props} />);
  act(() => jest.advanceTimersByTime(300));
  view.rerender(<FlowLoading {...props} active={false} />);
  view.rerender(<FlowLoading {...props} active />);
  act(() => jest.advanceTimersByTime(600));
  expect(screen.getByRole('status')).toHaveTextContent('正在取来经文');
});
