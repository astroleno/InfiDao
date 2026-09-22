const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoteStore, KEY } = require('../flow/notes');
const { createMockProvider } = require('../flow/provider');
const { examples } = require('../content/passages');

function storage() {
  const values = new Map();
  return { values, getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, structuredClone(value)) };
}
const context = { passageId: 'still', sourceId: 'classic', source: '大学', chapterLabel: '经一章', quote: '知止而后有定', seed: '我接了太多工作' };

test('personal notes keep their original thought, quotation and words across sessions and support undo', () => {
  const api = storage(), store = createNoteStore(api);
  const saved = store.add(context, '  我想先守住休息的时间。  ')[0];
  assert.equal(saved.text, '我想先守住休息的时间。');
  assert.equal(saved.seed, context.seed);
  assert.equal(saved.sourceId, context.sourceId);
  const reopened = createNoteStore(api);
  assert.deepEqual(reopened.list(), [saved]);
  const removed = reopened.remove(saved.id);
  assert.deepEqual(reopened.list(), []);
  assert.deepEqual(reopened.restore(removed), [saved]);
  assert.equal(reopened.restore(removed).length, 1);
});

test('storage failures never report a note as saved or removed', () => {
  const api = storage(), store = createNoteStore(api);
  const saved = store.add(context, '自己的话')[0];
  api.setStorageSync = () => { throw new Error('quota'); };
  assert.throws(() => store.add(context, '另一句'), /quota/);
  assert.throws(() => store.remove(saved.id), /quota/);
  assert.equal(api.values.get(KEY).length, 1);
  assert.throws(() => store.add(context, '  '), /Invalid note/);
});

test('curated examples respond to their exact situations while other inputs remain thematic mock', async () => {
  const provider = createMockProvider();
  for (const sample of examples) {
    const session = await provider.open(sample.seed);
    assert.equal(session.frames[0].id, sample.firstId);
    assert.equal(session.frames[0].reflection, sample.reflection);
    assert.equal(session.frames[0].provenance, 'curated-mock');
    assert.equal(session.seedOrigin, 'user');
    assert.equal(new Set(session.frames.map(frame => frame.id)).size, 8);
  }
  const first = await provider.open(examples[0].seed), second = await provider.open(examples[1].seed);
  assert.equal(first.frames[0].quote, second.frames[0].quote);
  assert.notEqual(first.frames[0].reflection, second.frames[0].reflection);
  assert.equal((await provider.open('')).seedOrigin, 'example');
  assert.equal((await provider.open('另一件工作上的事')).kind, 'mock');
});
