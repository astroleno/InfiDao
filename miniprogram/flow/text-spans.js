// Native text and server anchors share UTF-16 offsets. A link is accepted only
// when its explicit range still contains its label in this exact surface.
const { classicSpans } = require('./classic-text');
function textSpans(frame, surface) {
  if (surface === 'quote' || surface === 'fullText') return classicSpans(frame, surface);
  const text = frame[surface] || '', source = surface === 'fullText';
  const field = source ? 'quote' : surface;
  const ranges = (frame.anchors || []).filter(anchor => (anchor.surface || 'reflection') === field).flatMap(anchor => {
    const original = frame[field] || '';
    const start = Number.isInteger(anchor.start) ? anchor.start : original.indexOf(anchor.label);
    const end = Number.isInteger(anchor.end) ? anchor.end : start + anchor.label.length;
    if (start < 0 || original.slice(start, end) !== anchor.label) return [];
    const offset = source ? frame.quoteStart : 0;
    if (!Number.isInteger(offset) || text.slice(offset + start, offset + end) !== anchor.label) return [];
    return [{ start: start + offset, end: end + offset, id: anchor.id }];
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted = []; let last = -1;
  for (const range of ranges) if (range.start >= last) { accepted.push(range); last = range.end; }
  const selectedStart = source ? frame.quoteStart : -1, selectedEnd = source ? frame.quoteEnd : -1;
  const cuts = new Set([0, text.length]);
  for (const range of accepted) { cuts.add(range.start); cuts.add(range.end); }
  for (const index of [selectedStart, selectedEnd]) if (index >= 0 && index <= text.length) cuts.add(index);
  const points = Array.from(cuts).sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1], link = accepted.find(range => start >= range.start && end <= range.end);
    return { text: text.slice(start, end), anchorId: link?.id || '', selected: source && start >= selectedStart && end <= selectedEnd };
  });
}
module.exports = { textSpans };
