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
  expect(screen.getByTestId('reader')).toHaveAttribute('inert');
  expect(screen.getByRole('button', { name: '关闭阅读选项' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('reader')).not.toHaveAttribute('inert');
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

test('a controlled drawer isolates the full reader ancestry and reports close without changing parent state', () => {
  const onOpenChange = jest.fn();
  const view = render(<div><header data-testid="header">六经注我</header><div><main data-testid="text">经文</main>
    <FlowMenu {...props} open onOpenChange={onOpenChange} /></div><footer data-testid="footer">继续</footer></div>);
  for (const id of ['header', 'text', 'footer']) expect(screen.getByTestId(id)).toHaveAttribute('inert');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  view.rerender(<div><header data-testid="header">六经注我</header><div><main data-testid="text">经文</main>
    <FlowMenu {...props} open={false} onOpenChange={onOpenChange} /></div><footer data-testid="footer">继续</footer></div>);
  for (const id of ['header', 'text', 'footer']) expect(screen.getByTestId(id)).not.toHaveAttribute('inert');
});

test('the drawer retains collection announcements and current action states', () => {
  jest.useFakeTimers();
  try {
    const reading = { key: 'entry', source: '大学 · 经一章', sourceOpen: false, bookmarked: false, notesOpen: false,
      noteCount: 0, onSource: jest.fn(), onBookmark: jest.fn(), onNotes: jest.fn() };
    const view = render(<FlowMenu {...props} reading={reading} />);
    view.rerender(<FlowMenu {...props} reading={{ ...reading, bookmarked: true }} />);
    expect(screen.getByRole('status', { name: '收藏状态' })).toHaveTextContent('已收藏');
    fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
    view.rerender(<FlowMenu {...props} reading={{ ...reading, bookmarked: true, sourceOpen: true, notesOpen: true, noteCount: 2 }} />);
    expect(screen.getByRole('button', { name: '已收藏' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '收起原文' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '收起注脚 · 2' })).toHaveAttribute('aria-expanded', 'true');
  } finally { jest.useRealTimers(); }
});
