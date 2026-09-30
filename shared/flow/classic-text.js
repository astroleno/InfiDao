// Canonical UTF-16 ranges are shared by native text, wheel glyphs and branches.
// Segmentation is shipped with the corpus; older saved records get a complete
// character-level fallback, never a three-keyword whitelist.
function ranges(frame) {
  const text = frame.fullText || frame.passageQuote || frame.quote || '';
  let ends = frame.lexicalBreaks;
  if (!ends || ends[ends.length - 1] !== text.length) {
    let cursor = 0;
    ends = Array.from(text, char => (cursor += char.length));
  }
  let start = 0;
  return ends.map(end => {
    const range = { start, end, text: text.slice(start, end) };
    start = end;
    return range;
  }).filter(range => /[\p{L}\p{N}]/u.test(range.text));
}
function selectionFor(frame, range) {
  return { start: range.start, end: range.end, textHash: frame.textHash, corpusVersion: frame.corpusVersion };
}
function resolveSelection(frame, selection) {
  if (!selection || selection.textHash !== frame.textHash || selection.corpusVersion !== frame.corpusVersion) return null;
  const range = ranges(frame).find(item => item.start === selection.start && item.end === selection.end);
  return range ? { ...range, id: `text:${range.start}:${range.end}`, selection: selectionFor(frame, range) } : null;
}
function classicSpans(frame, surface = 'quote', from, to) {
  const text = frame.fullText || frame.passageQuote || frame.quote || '';
  const begin = from ?? (surface === 'fullText' ? 0 : frame.quoteStart || 0);
  const end = to ?? (surface === 'fullText' ? text.length : begin + (frame.passageQuote || frame.quote || '').length);
  const tokens = ranges(frame).filter(token => token.end > begin && token.start < end);
  const parts = []; let cursor = begin;
  for (const token of tokens) {
    const a = Math.max(begin, token.start), b = Math.min(end, token.end);
    if (cursor < a) parts.push({ text: text.slice(cursor, a) });
    parts.push({ text: text.slice(a, b), anchorId: `text:${token.start}:${token.end}`, selection: selectionFor(frame, token),
      selected: surface === 'fullText' && a >= frame.quoteStart && b <= frame.quoteEnd });
    cursor = b;
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end) });
  return parts;
}
module.exports = { ranges, selectionFor, resolveSelection, classicSpans };
