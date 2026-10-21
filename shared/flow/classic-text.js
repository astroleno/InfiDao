// Canonical UTF-16 ranges are shared by native text, wheel glyphs and branches.
// Segmentation is shipped with the corpus; older saved records get a complete
// character-level fallback, never a three-keyword whitelist.
function ranges(frame, surface) {
  const explanation = surface === 'meaning' || surface === 'reflection';
  const text = explanation ? frame[surface] || '' : frame.fullText || frame.passageQuote || frame.quote || '';
  let ends = explanation ? frame.textBreaks?.[surface] : frame.lexicalBreaks;
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
function selectionFor(frame, range, surface) {
  return { start: range.start, end: range.end, textHash: frame.textHash, corpusVersion: frame.corpusVersion,
    ...(surface === 'meaning' || surface === 'reflection' ? { surface, surfaceText: frame[surface] } : {}) };
}
function resolveSelection(frame, selection) {
  if (!selection || selection.textHash !== frame.textHash || selection.corpusVersion !== frame.corpusVersion) return null;
  const surface = selection.surface;
  if (surface && (!['meaning', 'reflection'].includes(surface) ||
    (frame.ready === false && !frame.settled?.[surface]) || selection.surfaceText !== frame[surface])) return null;
  const range = ranges(frame, surface).find(item => item.start === selection.start && item.end === selection.end);
  return range ? { ...range, id: `${surface || 'text'}:${range.start}:${range.end}`, selection: selectionFor(frame, range, surface) } : null;
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
