const test = require('node:test');
const assert = require('node:assert/strict');
const { textSpans } = require('../flow/text-spans');
const { createCuratedProvider } = require('../flow/curated-provider');
const { resolveSelection } = require('../flow/classic-text');

test('all curated original, meaning and reflection entries preserve their exact text and open the verified target', async () => {
  const provider = createCuratedProvider();
  let chain = await provider.open('');
  const seen = new Set();
  for (let depth = 0; depth < 16; depth++) {
    for (const frame of chain.frames) {
      seen.add(frame.id.split(':').at(-1));
      for (const surface of ['quote', 'meaning', 'reflection', 'fullText']) {
        const spans = textSpans(frame, surface);
        assert.equal(spans.map(span => span.text).join(''), frame[surface]);
        assert.ok(spans.some(span => span.anchorId), surface + ' has an entry');
        for (const span of spans.filter(span => span.anchorId)) {
          if (span.selection) {
            const token = resolveSelection(frame, span.selection);
            assert.ok(token && token.text.includes(span.text));
            assert.equal(token.id, span.anchorId);
            continue;
          }
          const anchor = frame.anchors.find(item => item.id === span.anchorId);
          assert.equal(span.text, anchor.label);
          assert.equal(anchor.surface, surface === 'fullText' ? 'quote' : surface);
          const child = await provider.branch({ chainId: chain.chainId, fromFrameId: frame.id, anchorId: anchor.id });
          assert.equal(child.frames[0].sourceId, anchor.target.sourceId);
          assert.equal(child.parentChainId, chain.chainId);
        }
      }
    }
    if (chain.cursor) chain = await provider.next({ chainId: chain.chainId, cursor: chain.cursor });
    else if (depth === 2) chain = await provider.open('我和朋友意见不同');
    else if (depth === 5) chain = await provider.open('我一直准备却没有开始');
    else if (depth > 5) break;
  }
  assert.equal(seen.size, 16);
});

test('every occurrence in the source links independently, including words outside the displayed excerpt', () => {
  const frame = { quote: '知止而后有定', meaning: '', reflection: '', fullText: '止。知止而后有定。', quoteStart: 2, quoteEnd: 8,
    anchors: [{ id: 'q', surface: 'quote', label: '止', start: 1, end: 2 }] };
  const spans = textSpans(frame, 'fullText');
  assert.equal(spans.map(span => span.text).join(''), frame.fullText);
  const stops = spans.filter(span => span.text === '止');
  assert.equal(stops.length, 2);
  assert.notEqual(stops[0].anchorId, stops[1].anchorId);
  assert.equal(stops[0].selected, false);
  assert.equal(stops[1].selected, true);
  assert.deepEqual(stops.map(part => part.selection.start), [0, 3]);
});

test('overlapping explanation links, punctuation and supplementary Unicode characters retain exact text', () => {
  const frame = { meaning: '𠮷，本末。', anchors: [
    { id: 'first', surface: 'meaning', label: '本末', start: 3, end: 5 },
    { id: 'overlap', surface: 'meaning', label: '本', start: 3, end: 4 },
    { id: 'invalid', surface: 'meaning', label: '末', start: 2, end: 3 },
  ] };
  const spans = textSpans(frame, 'meaning');
  assert.equal(spans.map(span => span.text).join(''), frame.meaning);
  assert.deepEqual(spans.filter(span => span.anchorId).map(span => span.anchorId), ['first']);
});
