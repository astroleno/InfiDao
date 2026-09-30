import { fireEvent, render, screen } from '@testing-library/react';
import { SeedSheet } from '@/components/flow/SeedSheet';

const props = () => ({ open: true, value: '想睡觉', busy: false, error: '', onChange: jest.fn(), onSubmit: jest.fn(), onClose: jest.fn(), onCancel: jest.fn() });

test('shows the request failure inside the dialog and preserves the entered thought', () => {
  const p = props();
  render(<SeedSheet {...p} error="先读一会儿，稍后再展开新的联系。" />);
  const dialog = screen.getByRole('dialog');
  expect(dialog).toContainElement(screen.getByRole('alert'));
  expect(screen.getByRole('textbox')).toHaveValue('想睡觉');
  expect(screen.getByRole('textbox')).toHaveAccessibleDescription('先读一会儿，稍后再展开新的联系。');
  fireEvent.click(screen.getByRole('button', { name: '开始阅读' }));
  expect(p.onSubmit).toHaveBeenCalledTimes(1);
});

test('keeps cancellation available while generation is pending and prevents duplicate submission', () => {
  const p = props();
  render(<SeedSheet {...p} busy />);
  expect(screen.getByRole('textbox')).toBeDisabled();
  expect(screen.getByRole('button', { name: '正在展开' })).toBeDisabled();
  const cancel = screen.getByRole('button', { name: '停止展开' });
  expect(cancel).toBeEnabled();
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  expect(p.onCancel).toHaveBeenCalledTimes(1);
  expect(p.onClose).not.toHaveBeenCalled();
});

test('isolates background controls and restores prior attributes and focus on close', () => {
  const p = props();
  const view = render(<><div data-testid="background"><button>打开一念</button></div><SeedSheet {...p} open={false} /></>);
  const trigger = screen.getByRole('button', { name: '打开一念' });
  trigger.focus();
  view.rerender(<><div data-testid="background"><button>打开一念</button></div><SeedSheet {...p} /></>);
  expect(screen.getByTestId('background')).toHaveAttribute('inert');
  expect(screen.getByTestId('background')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('button', { name: '打开一念' })).not.toBeInTheDocument();
  view.rerender(<><div data-testid="background"><button>打开一念</button></div><SeedSheet {...p} open={false} /></>);
  expect(screen.getByTestId('background')).not.toHaveAttribute('inert');
  expect(trigger).toHaveFocus();
});
