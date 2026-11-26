import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { LinkedText } from '@/components/flow/LinkedText';
import { displayClassicQuote, displayClassicText, projectClassicText } from '@/lib/flow-browser/classic-display';
import type { FlowFrame } from '@/lib/flow/contracts';

function frame(fullText: string, lexicalBreaks: number[], quoteStart = 0, quoteEnd = fullText.length): FlowFrame {
  return {
    id: 'classical-display-test', ordinal: 0, sourceId: 'test-source', source: '大学', chapterLabel: '经一章',
    fullText, lexicalBreaks, quoteStart, quoteEnd, quote: fullText.slice(quoteStart, quoteEnd),
    meaning: '后来才知道', reflection: '不必着急', reflectionSpans: [{ text: '不必着急' }], textBreaks: { meaning: [2, 3, 5], reflection: [2, 4] },
    anchors: [], textHash: 'test-hash', corpusVersion: 'guji-core-v1', provenance: 'curated', ready: true,
  };
}

test('resolves contextual variants using the whole passage before slicing the selected range', () => {
  const source = frame('皇后，后来，干戈，才干', [2, 3, 5, 6, 8, 9, 11], 1, 2);
  expect(displayClassicText(source.fullText)).toBe('皇后，後來，干戈，才幹');
  expect(displayClassicQuote(source)).toBe('后');
  expect(displayClassicQuote({ ...source, quoteStart: 3, quoteEnd: 4 })).toBe('後');
  expect(displayClassicQuote({ ...source, quoteStart: -1 })).toBe('后');
  expect(displayClassicQuote({ quote: '后' })).toBe('后');
});

test('retains canonical UTF-16 boundaries when a compatibility ideograph becomes BMP', () => {
  const source = frame('甲丽乙', [1, 3, 4], 1, 3);
  const projection = projectClassicText(source.fullText);
  expect(projection?.text).toBe('甲麗乙');
  expect(projection?.slice(1, 3)).toBe('麗');
  expect(projection?.slice(2, 3)).toBeNull();
  expect(displayClassicQuote(source)).toBe('麗');

  const select = jest.fn();
  render(<LinkedText frame={source} surface="fullText" onSelect={select} />);
  const word = screen.getByRole('button', { name: '麗' });
  expect(word.getAttribute('data-source-quote')).toBe('true');
  fireEvent.click(word);
  expect(select).toHaveBeenCalledWith({
    frameId: source.id, label: '丽', anchorId: 'text:1:3',
    selection: { start: 1, end: 3, textHash: source.textHash, corpusVersion: source.corpusVersion },
  });

  const browserSelection = document.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(word);
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
  const setData = jest.fn();
  fireEvent.copy(word, { clipboardData: { setData } });
  expect(setData).toHaveBeenCalledWith('text/plain', '丽');
  browserSelection.removeAllRanges();
});

test('retains canonical offsets for repeated words and leaves modern text simplified', () => {
  const source = frame('后来，后来', [2, 3, 5]);
  const select = jest.fn();
  const { rerender } = render(<LinkedText frame={source} surface="quote" optical onSelect={select} />);
  const links = screen.getAllByRole('button', { name: '後來' });
  act(() => links[0]!.focus());
  fireEvent.keyDown(links[0]!, { key: 'End' });
  expect(document.activeElement).toBe(links[1]);
  fireEvent.click(links[1]!);
  expect(select).toHaveBeenCalledWith(expect.objectContaining({
    label: '后来', anchorId: 'text:3:5', selection: expect.objectContaining({ start: 3, end: 5 }),
  }));
  expect(Array.from(screen.getByRole('group').querySelectorAll('[data-flow-optic]'), el => el.textContent).join('')).toBe('後來，後來');

  rerender(<LinkedText frame={source} surface="meaning" onSelect={select} />);
  expect(within(screen.getByRole('group')).getByRole('button', { name: '后来' })).toBeDefined();
  expect(screen.getByRole('group').hasAttribute('lang')).toBe(false);
});

test('keeps a legacy record readable when lexical boundaries split a surrogate pair', () => {
  const source = frame('甲丽乙', [2, 4]);
  render(<LinkedText frame={source} surface="quote" onSelect={() => {}} />);
  expect(screen.getByText(source.fullText)).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
});

test('copies a single unchanged-script passage with only its authority line break', () => {
  const source = frame('雙飲𧣴，\n其銀', [2, 4, 5, 6, 8]);
  render(<LinkedText frame={source} surface="quote" optical onSelect={() => {}} />);
  const group = screen.getByRole('group');
  const parts = Array.from(group.querySelectorAll('[data-flow-classic-part]'));
  const word = parts[0]!.firstChild as Text;
  const last = parts.at(-1)!.firstChild as Text;
  const selection = document.getSelection()!;
  const range = document.createRange();
  range.setStart(word, 1);
  range.setEnd(last, 1);
  selection.addRange(range);
  const setData = jest.fn();
  fireEvent.copy(group, { clipboardData: { setData } });
  expect(setData).toHaveBeenCalledWith('text/plain', '飲𧣴，\n其');
  selection.removeAllRanges();
});
