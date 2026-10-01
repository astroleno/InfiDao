import { act, fireEvent, render, screen } from '@testing-library/react';
import { FlowWaiting } from '@/components/flow/FlowWaiting';

test('names the selected word, explains a long wait, and keeps cancellation available', () => {
  jest.useFakeTimers();
  const cancel = jest.fn();
  const view = render(<FlowWaiting busy label="知止" onCancel={cancel} />);
  expect(screen.getByRole('status')).toHaveTextContent('沿「知止」');
  act(() => { jest.advanceTimersByTime(12_000); });
  expect(screen.getByRole('status')).toHaveTextContent('尚未收到经句');
  fireEvent.click(screen.getByRole('button', { name: '停止展开' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  view.rerender(<FlowWaiting busy={false} onCancel={cancel} />);
  expect(screen.getByRole('status')).toHaveTextContent('经句已到');
  view.unmount();
  jest.useRealTimers();
});
