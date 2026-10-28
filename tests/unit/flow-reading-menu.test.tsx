import { fireEvent, render, screen } from '@testing-library/react';
import { FlowMenu } from '@/components/flow/FlowMenu';

const props = { onThought: jest.fn(), onLibrary: jest.fn(), libraryDisabled: false };

function pointer(target: Element | Document, type: string, x: number, at: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 200 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: at } });
  fireEvent(target, event);
}

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

test('the visible exit retains a pointer shield while menu commands are inert', () => {
  const view = render(<FlowMenu {...props} open />);
  view.rerender(<FlowMenu {...props} open={false} />);
  const panel = view.container.querySelector('[data-flow-menu]')!;
  const backdrop = view.container.querySelector('[data-flow-menu-backdrop]')!;
  expect(panel).toHaveAttribute('inert');
  expect(panel).not.toHaveAttribute('hidden');
  expect(backdrop).not.toHaveAttribute('hidden');
  expect(backdrop).toHaveStyle({ pointerEvents: 'auto' });
});

test.each([
  { open: false, dx: -60, expected: false },
  { open: true, dx: 60, expected: true },
])('a short fast drag held still settles by position (open=$open)', ({ open, dx, expected }) => {
  const onOpenChange = jest.fn();
  const view = render(<FlowMenu {...props} open={open} onOpenChange={onOpenChange} />);
  const surface = view.container.querySelector(open ? '[data-flow-menu]' : '[data-flow-menu-root] button')!;
  pointer(surface, 'pointerdown', 250, 0);
  pointer(document, 'pointermove', 250 + dx, 20);
  pointer(document, 'pointerup', 250 + dx, 420);
  expect(onOpenChange).toHaveBeenLastCalledWith(expected);
});

test.each([
  { open: false, dx: -60, expected: true },
  { open: true, dx: 60, expected: false },
])('the same drag released promptly retains its flick (open=$open)', ({ open, dx, expected }) => {
  const onOpenChange = jest.fn();
  const view = render(<FlowMenu {...props} open={open} onOpenChange={onOpenChange} />);
  const surface = view.container.querySelector(open ? '[data-flow-menu]' : '[data-flow-menu-root] button')!;
  pointer(surface, 'pointerdown', 250, 0);
  pointer(document, 'pointermove', 250 + dx, 20);
  pointer(document, 'pointerup', 250 + dx, 35);
  expect(onOpenChange).toHaveBeenLastCalledWith(expected);
});

test('a release includes the final position when the last movement was coalesced', () => {
  const onOpenChange = jest.fn();
  render(<FlowMenu {...props} open={false} onOpenChange={onOpenChange} />);
  pointer(screen.getByRole('button', { name: '更多阅读选项' }), 'pointerdown', 380, 0);
  pointer(document, 'pointermove', 350, 1000);
  pointer(document, 'pointerup', 170, 1020);
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
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

test('the drawer reflects action states without treating them as persistence acknowledgements', () => {
  jest.useFakeTimers();
  try {
    const reading = { key: 'entry', source: '大学 · 经一章', sourceOpen: false, bookmarked: false, notesOpen: false,
      noteCount: 0, onSource: jest.fn(), onBookmark: jest.fn(), onNotes: jest.fn() };
    const view = render(<FlowMenu {...props} reading={reading} />);
    view.rerender(<FlowMenu {...props} reading={{ ...reading, bookmarked: true }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
    view.rerender(<FlowMenu {...props} reading={{ ...reading, bookmarked: true, sourceOpen: true, notesOpen: true, noteCount: 2 }} />);
    expect(screen.getByRole('button', { name: '已收藏' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '收起原文' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '收起注脚 · 2' })).toHaveAttribute('aria-expanded', 'true');
  } finally { jest.useRealTimers(); }
});

test('an ancestor passage shows and returns through its own origin in a deeper trail', () => {
  const toRoot = jest.fn(), toMiddle = jest.fn();
  const origins = [
    { pathId: 'middle', label: '沿「止」而来', onReturn: toRoot },
    { pathId: 'leaf', label: '沿「定」而来', onReturn: toMiddle },
  ];
  const reading = { key: 'middle:first', pathId: 'middle', source: '大学', sourceOpen: false, bookmarked: false, notesOpen: false,
    noteCount: 0, onSource: jest.fn(), onBookmark: jest.fn(), onNotes: jest.fn() };
  const view = render(<FlowMenu {...props} origins={origins} reading={reading} />);
  const trigger = screen.getByRole('button', { name: '更多阅读选项' });
  fireEvent.click(trigger);
  expect(screen.getByText('沿「止」而来')).toBeInTheDocument();
  expect(screen.queryByText('沿「定」而来')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '回到来处' }));
  expect(toRoot).toHaveBeenCalledTimes(1);
  expect(toMiddle).not.toHaveBeenCalled();
  view.rerender(<FlowMenu {...props} origins={origins} reading={{ ...reading, key: 'leaf:first', pathId: 'leaf' }} />);
  fireEvent.click(trigger);
  expect(screen.getByText('沿「定」而来')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '回到来处' }));
  expect(toMiddle).toHaveBeenCalledTimes(1);
});
