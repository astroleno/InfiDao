import { fireEvent, render, screen } from '@testing-library/react';
import { FlowMenu } from '@/components/flow/FlowMenu';

const props = { onThought: jest.fn(), onLibrary: jest.fn(), libraryDisabled: false };

test('the edge handle opens a modal drawer and Escape restores focus and reader access', () => {
  const onOpen = jest.fn();
  render(<div><main data-testid="reader">经文</main><FlowMenu {...props} onOpen={onOpen} /></div>);
  const trigger = screen.getByRole('button', { name: '更多阅读选项' });
  expect(trigger.querySelector('svg')).toBeNull();
  fireEvent.click(trigger);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog', { name: '阅读选项' })).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByTestId('reader').inert).toBe(true);
  expect(screen.getByRole('button', { name: '关闭阅读选项' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('reader').inert).not.toBe(true);
  expect(trigger).toHaveFocus();
});

test('the drawer cycles keyboard focus and keeps the original actions', () => {
  const onThought = jest.fn(), onLibrary = jest.fn();
  render(<FlowMenu {...props} onThought={onThought} onLibrary={onLibrary} />);
  const trigger = screen.getByRole('button', { name: '更多阅读选项' });
  fireEvent.click(trigger);
  const close = screen.getByRole('button', { name: '关闭阅读选项' });
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  const library = screen.getByRole('button', { name: '温故' });
  expect(library).toHaveFocus();
  fireEvent.keyDown(library, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '添一念' }));
  expect(onThought).toHaveBeenCalledTimes(1);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: '温故' }));
  expect(onLibrary).toHaveBeenCalledTimes(1);
});

test('horizontal gestures open and close the drawer without firing a click action', () => {
  const onThought = jest.fn();
  render(<FlowMenu {...props} onThought={onThought} />);
  const trigger = screen.getByRole('button', { name: '更多阅读选项' });
  fireEvent(trigger, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 380, clientY: 400 }));
  fireEvent(trigger, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 310, clientY: 405 }));
  fireEvent.click(trigger, { detail: 1 });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const thought = screen.getByRole('button', { name: '添一念' });
  fireEvent(thought, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 180 }));
  fireEvent(thought, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 280, clientY: 185 }));
  fireEvent.click(thought, { detail: 1 });
  expect(onThought).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
