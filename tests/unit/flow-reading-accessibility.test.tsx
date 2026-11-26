import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkedText } from '@/components/flow/LinkedText';
import { NotesPanel } from '@/components/flow/NotesPanel';
import type { FlowFrame } from '@/lib/flow/contracts';
import type { PersonalNote } from '@/lib/flow-browser/storage';

const frame = { id: 'one', fullText: '「学而时习之，不亦说乎？」', quote: '「学而时习之，不亦说乎？」', quoteStart: 0, quoteEnd: 13,
  lexicalBreaks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], textHash: 'hash', corpusVersion: 'v1', anchors: [] } as unknown as FlowFrame;

test('keeps punctuation attached visually and preserves exact canonical selections', () => {
  const onSelect = jest.fn();
  render(<LinkedText frame={frame} surface="quote" onSelect={onSelect} />);
  const word = screen.getByRole('button', { name: '之' });
  expect(word.parentElement).toHaveTextContent('之，');
  expect(screen.getByRole('button', { name: '学' }).parentElement).toHaveTextContent('「学');
  expect(screen.getByRole('button', { name: '乎' }).parentElement).toHaveTextContent('乎？」');
  fireEvent.click(word);
  expect(onSelect).toHaveBeenCalledWith({ frameId: 'one', anchorId: 'text:5:6', label: '之', selection: { start: 5, end: 6, textHash: 'hash', corpusVersion: 'v1' } });
});

test('keeps a short clause ending together without joining its optical runs or word selections', () => {
  const quote = '所求乎朋友先施之，未能也。';
  const onSelect = jest.fn();
  render(<LinkedText frame={{ ...frame, fullText: quote, quote, quoteEnd: quote.length,
    lexicalBreaks: [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13] }} surface="quote" optical onSelect={onSelect} />);

  const leading = screen.getByRole('button', { name: '先' });
  const verb = screen.getByRole('button', { name: '施' });
  const ending = screen.getByRole('button', { name: '之' });
  const runs = [leading, verb, ending].map(button => button.closest('[data-flow-optic]'));
  expect(new Set(runs).size).toBe(3);
  expect(new Set(runs.map(run => run?.parentElement)).size).toBe(1);
  expect(runs[0]?.parentElement?.textContent).toBe('先施之，');
  act(() => verb.focus());
  fireEvent.keyDown(verb, { key: 'ArrowRight' });
  expect(ending).toHaveFocus();
  fireEvent.click(ending);
  expect(onSelect).toHaveBeenCalledWith({ frameId: 'one', anchorId: 'text:7:8', label: '之',
    selection: { start: 7, end: 8, textHash: 'hash', corpusVersion: 'v1' } });
});

test('uses one tab stop per passage and arrow/Home/End to choose words', () => {
  render(<LinkedText frame={frame} surface="quote" onSelect={jest.fn()} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons.filter(button => button.tabIndex === 0)).toHaveLength(1);
  act(() => buttons[0]!.focus());
  fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' });
  expect(buttons[1]).toHaveFocus();
  expect(buttons[0]).toHaveAttribute('tabindex', '-1');
  fireEvent.keyDown(buttons[1]!, { key: 'End' });
  expect(buttons.at(-1)).toHaveFocus();
  fireEvent.keyDown(buttons.at(-1)!, { key: 'Home' });
  expect(buttons[0]).toHaveFocus();
});

test('deleting notes focuses the next note or undo and announces the result', async () => {
  const first = { id: 'first', text: '第一条' } as PersonalNote;
  const second = { id: 'second', text: '第二条' } as PersonalNote;
  function Example() {
    const [notes, setNotes] = useState([first, second]);
    return <NotesPanel notes={notes} saving={false} onSave={async () => {}} onDelete={async id => { setNotes(items => items.filter(note => note.id !== id)); }} onUndo={async () => { setNotes([second]); }} />;
  }
  render(<Example />);
  expect(screen.getByRole('heading', { name: '自己的注脚', level: 2 })).toBeInTheDocument();
  act(() => screen.getAllByRole('button', { name: '删除' })[0]!.focus());
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!); });
  await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toHaveFocus());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '删除' })); });
  await waitFor(() => expect(screen.getByRole('button', { name: '撤销删除' })).toHaveFocus());
  expect(screen.getByRole('status')).toHaveTextContent('注脚已删除');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销删除' })); });
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
  expect(screen.getByRole('status')).toHaveTextContent('注脚已恢复');
});
