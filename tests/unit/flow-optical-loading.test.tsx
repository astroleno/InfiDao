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
  expect(screen.getByRole('status')).toHaveTextContent('经文已到');
  view.rerender(<FlowLoading {...props} active={false} progress={{ phase: 'ready', loaded: 2, total: 2 }} quote="物有本末，事有终始。" />);
  expect(view.container.firstChild).toHaveAttribute('data-phase', 'focus');
  expect(screen.getByText('物有本末，事有终始。')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(480));
  expect(view.container).toBeEmptyDOMElement();
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
