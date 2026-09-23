const { passages } = require('../content/passages');
const links = require('../content/branches');
const entryWords = require('../content/entry-words');
const { createMockProvider } = require('./provider');
const { requestId } = require('./remote-provider');
const breaks = require('../content/lexical-breaks');
const { resolveSelection } = require('./classic-text');

function createCuratedProvider() {
  const chains = new Map(), branches = new Map();
  function frame(id, chainId, ordinal) {
    const passage = passages[id], definition = links[id];
    const quote = passage.fullText.includes(passage.quote) ? passage.quote : passage.quote.replace(/[，。！？；]$/, '');
    if (!passage.fullText.includes(quote)) throw new Error('Unverified curated quotation');
    const anchors = definition[1].map(([label, targetId], index) => ({ id: `${chainId}:${id}:${index}`, label, surface: 'reflection',
      start: definition[0].indexOf(label), end: definition[0].indexOf(label) + label.length,
      sense: definition[0], direction: label, terms: [label], target: { sourceId: passages[targetId].sourceId, quote: passages[targetId].quote, meaning: passages[targetId].meaning }, targetId }));
    const spans = []; let cursor = 0;
    for (const anchor of anchors.slice().sort((a, b) => definition[0].indexOf(a.label) - definition[0].indexOf(b.label))) {
      const at = definition[0].indexOf(anchor.label);
      if (at < cursor) continue;
      if (at > cursor) spans.push({ text: definition[0].slice(cursor, at) });
      spans.push({ text: anchor.label, anchorId: anchor.id }); cursor = at + anchor.label.length;
    }
    if (cursor < definition[0].length) spans.push({ text: definition[0].slice(cursor) });
    entryWords[id].forEach(([label, targetId], index) => {
      const surface = index === 0 ? 'quote' : 'meaning', text = surface === 'quote' ? quote : passage.meaning;
      const start = text.indexOf(label);
      if (start < 0) throw new Error('Unverified curated entry');
      anchors.push({ id: `${chainId}:${id}:${surface}`, surface, label, start, end: start + label.length,
        sense: passage.meaning, direction: links[targetId][0], terms: [label], targetId,
        target: { sourceId: passages[targetId].sourceId, quote: passages[targetId].quote, meaning: passages[targetId].meaning } });
    });
    return { ...passage, lexicalBreaks: breaks[id].ends, textHash: breaks[id].textHash, lines: undefined, id: chainId + ':' + id, quote, ordinal,
      quoteStart: passage.fullText.indexOf(quote), quoteEnd: passage.fullText.indexOf(quote) + quote.length,
      reflection: definition[0], reflectionSpans: spans, anchors, provenance: 'curated', ready: true, corpusVersion: 'guji-core-v1' };
  }
  function create(ids, seed, parent, entry) {
    const chainId = 'curated-' + requestId();
    const chain = { chainId, version: 'curated-branches-v2', kind: 'curated', seed, seedOrigin: seed ? 'user' : 'example',
      sequence: ids, journey: 'branch', focus: entry ? entry.label : '此刻的一念', parentChainId: parent || null, entry: entry || null,
      frames: ids.map((id, index) => frame(id, chainId, index + 1)), cursor: null, exhausted: false };
    chains.set(chainId, chain);
    while (chains.size > 128) chains.delete(chains.keys().next().value);
    while (branches.size > 256) branches.delete(branches.keys().next().value);
    // Server-like finite batches; reaching the end never loops old content.
    return batch(chain, 0);
  }
  function batch(chain, start) {
    const frames = chain.frames.slice(start, start + 3), next = start + frames.length;
    return { ...chain, frames, cursor: next < chain.frames.length ? String(next) : null, exhausted: next >= chain.frames.length };
  }
  return { kind: 'curated',
    restore(chain) {
      if (chain.kind !== 'curated' || !chain.sequence) return;
      chains.set(chain.chainId, { ...chain, frames: chain.sequence.map((id, index) => frame(id, chain.chainId, index + 1)) });
    },
    async open(seed) {
      const mock = await createMockProvider().open(seed);
      return create(mock.frames.map(item => item.id), String(seed || '').trim(), null, null);
    },
    async branch({ chainId, fromFrameId, anchorId, selection }) {
      const parent = chains.get(chainId), node = parent?.frames.find(item => item.id === fromFrameId);
      let anchor = node?.anchors.find(item => item.id === anchorId);
      if (node && selection) {
        const token = resolveSelection(node, selection);
        if (!token) throw new Error('这个字词的位置已经变化，请重新选择。');
        const prepared = node.anchors.find(item => item.surface === 'quote' && node.quoteStart + item.start === token.start && node.quoteStart + item.end === token.end);
        const targetId = prepared?.targetId;
        if (!targetId) throw Object.assign(new Error('这个字词还没有离线接续。连接 DS 后，可按原文语境展开。'), { code: 'CONNECTION_REQUIRED' });
        anchor = { label: token.text, targetId };
        anchorId = token.id;
      }
      if (!anchor) throw new Error('这个入口已经变化，请重新选择。');
      const key = chainId + ':' + fromFrameId + ':' + anchorId;
      if (branches.has(key) && chains.has(branches.get(key))) return batch(chains.get(branches.get(key)), 0);
      const ids = [anchor.targetId], queue = [anchor.targetId];
      while (queue.length && ids.length < Object.keys(passages).length) {
        for (const [, target] of links[queue.shift()][1]) if (!ids.includes(target)) { ids.push(target); queue.push(target); }
      }
      const result = create(ids, parent.seed, chainId, { fromFrameId, anchorId, label: anchor.label });
      branches.set(key, result.chainId); return result;
    },
    async next({ chainId, cursor }) {
      const chain = chains.get(chainId);
      if (!chain) throw new Error('这条示例链已结束，请重新展开。');
      const start = Number(cursor);
      if (!Number.isInteger(start) || start < 0 || start > chain.frames.length) throw new Error('Invalid cursor');
      return batch(chain, start);
    },
  };
}
module.exports = { createCuratedProvider };
