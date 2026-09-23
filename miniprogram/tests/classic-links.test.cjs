const test = require('node:test');
const assert = require('node:assert/strict');
const { classicSpans, ranges, resolveSelection } = require('../flow/classic-text');
const { readingLines, sceneMetrics, quotationGeometry, projectedGlyphs } = require('../flow/scene');
const { WheelRenderer } = require('../flow/renderer');
const { FlowTimeline } = require('../flow/timeline');

function frame(text) {
  return { id: 'verse', quote: text, fullText: text, quoteStart: 0, quoteEnd: text.length, textHash: 'hash', corpusVersion: 'test',
    lexicalBreaks: Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(text), part => part.index + part.segment.length) };
}
test('all meaningful classical units are links without changing punctuation or requiring model-picked anchors', () => {
  const node = frame('物有本末，事有终始。𠮷人。');
  const parts = classicSpans(node, 'fullText');
  assert.equal(parts.map(p => p.text).join(''), node.fullText);
  assert.deepEqual(parts.filter(p => p.selection).map(p => p.text), ['物', '有', '本末', '事', '有', '终始', '𠮷', '人']);
  assert.ok(parts.filter(p => /[，。]/.test(p.text)).every(p => !p.selection));
  for (const part of parts.filter(p => p.selection)) {
    assert.equal(resolveSelection(node, part.selection).text, part.text);
    assert.equal(resolveSelection(node, { ...part.selection, textHash: 'stale' }), null);
    assert.equal(resolveSelection(node, { ...part.selection, end: part.selection.end + 1 }), null);
  }
});

test('wrapped text retains canonical offsets and a word crossing a visual row keeps one identity', () => {
  const node = frame('一二三四五六七八本末，物有本末。');
  const lines = readingLines([node]);
  for (const line of lines) assert.equal(node.fullText.slice(line.lineStart, line.lineStart + line.quote.length), line.quote);
  const token = ranges(node).find(t => t.text === '本末');
  assert.ok(token);
  const parts = lines.flatMap(line => classicSpans(node, 'quote', line.lineStart, line.lineStart + line.quote.length));
  const linked = parts.filter(part => part.selection?.start === token.start);
  assert.equal(linked.map(p => p.text).join(''), '本末');
  assert.equal(new Set(linked.map(p => p.anchorId)).size, 1);
});

test('wheel glyph hit ranges match visible projection and ignore blank space and blurred rear copies', () => {
  for (const [width, height] of [[320, 580], [390, 725], [820, 600]]) {
    const frames = readingLines([frame('物有本末，事有终始。')]);
    const glyphs = Object.fromEntries(Array.from(new Set(frames.flatMap(f => Array.from(f.quote)))).map(char => [char, [0, 0, 1, 1]]));
    const metrics = sceneMetrics(width, height), timeline = new FlowTimeline(frames.length);
    const vertices = quotationGeometry(frames, glyphs, metrics.radius, metrics.fontSize, height / 2);
    const renderer = { frames, vertices, timeline, width, height, count: frames.length, reading: 0 };
    for (let index = 0; index < frames.length; index++) {
      timeline.centers = frames.map(f => f.centerOffset); timeline.position = timeline.targetFor(index);
      // Use the renderer's own timeline units, not an equal screen partition.
      const { CELL, CENTER_PHASE } = require('../flow/timeline');
      const row = projectedGlyphs(vertices, timeline.position / CELL - CENTER_PHASE, frames.length, width, height).filter(g => g.index === index);
      for (const box of row) {
        const char = Array.from(frames[index].quote)[box.charIndex];
        const hit = WheelRenderer.prototype.hitText.call(renderer, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
        if (/[\p{L}\p{N}]/u.test(char)) {
          assert.ok(hit, char + ' should be a target');
          assert.ok(resolveSelection(frames[index], hit.selection).text.includes(char));
        }
      }
      assert.equal(WheelRenderer.prototype.hitText.call(renderer, -20, height / 2), null);
      assert.equal(WheelRenderer.prototype.hitText.call(renderer, width / 2, 0), null);
    }
  }
});
