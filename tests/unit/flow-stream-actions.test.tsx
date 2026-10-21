import { act, fireEvent, render, screen } from '@testing-library/react';
import { StreamActions } from '@/components/flow/StreamActions';

const props = { source: '大学 · 经一章', sourceOpen: false, bookmarked: false, notesOpen: false, noteCount: 0,
  onOpen: jest.fn(), onSource: jest.fn(), onBookmark: jest.fn(), onNotes: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('secondary actions are absent from the focus order until the disclosure is opened', () => {
  render(<StreamActions {...props} />);
  const trigger = screen.getByRole('button', { name: /原文、收藏、注脚/ });
  expect(screen.queryByRole('group', { name: '经文操作' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(trigger);
  expect(props.onOpen).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('group', { name: '经文操作' })).toBeVisible();
  expect(screen.getAllByRole('button')).toHaveLength(4);
});

test.each([['原文', 'onSource'], ['收藏', 'onBookmark'], ['注脚', 'onNotes']] as const)('%s invokes the existing action and returns focus', (name, callback) => {
  render(<StreamActions {...props} />);
  const trigger = screen.getByRole('button', { name: /原文、收藏、注脚/ });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name }));
  expect(props[callback]).toHaveBeenCalledTimes(1);
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('Escape and outside pointer close without trapping keyboard or pointer input', () => {
  render(<><StreamActions {...props} /><button>继续阅读</button></>);
  const trigger = screen.getByRole('button', { name: /原文、收藏、注脚/ });
  fireEvent.click(trigger);
  act(() => screen.getByRole('button', { name: '原文' }).focus());
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: '继续阅读' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  act(() => screen.getByRole('button', { name: '原文' }).focus());
  act(() => screen.getByRole('button', { name: '继续阅读' }).focus());
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('bookmark feedback waits for the saved state and open controls reflect existing disclosures', () => {
  jest.useFakeTimers();
  const view = render(<StreamActions {...props} />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  view.rerender(<StreamActions {...props} bookmarked sourceOpen notesOpen noteCount={2} />);
  expect(screen.getByRole('status')).toHaveTextContent('已收藏');
  fireEvent.click(screen.getByRole('button', { name: /原文、收藏、注脚/ }));
  expect(screen.getByRole('button', { name: '已收藏' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '收起原文' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: '收起注脚 · 2' })).toHaveAttribute('aria-expanded', 'true');
  act(() => jest.advanceTimersByTime(2400));
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  jest.useRealTimers();
});

test('a disclosure near the top opens below and scrolling closes it with focus retained', () => {
  const view = render(<div data-flow-viewport><StreamActions {...props} /></div>);
  const trigger = screen.getByRole('button', { name: /原文、收藏、注脚/ });
  jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 25 } as DOMRect);
  fireEvent.click(trigger);
  expect(screen.getByRole('group', { name: '经文操作' })).toHaveAttribute('data-placement', 'below');
  act(() => screen.getByRole('button', { name: '原文' }).focus());
  fireEvent.scroll(view.container.firstElementChild!);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

test('a disclosure with enough space opens above and resizing closes it', () => {
  render(<StreamActions {...props} />);
  const trigger = screen.getByRole('button', { name: /原文、收藏、注脚/ });
  jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);
  fireEvent.click(trigger);
  expect(screen.getByRole('group', { name: '经文操作' })).toHaveAttribute('data-placement', 'above');
  fireEvent(window, new Event('resize'));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
