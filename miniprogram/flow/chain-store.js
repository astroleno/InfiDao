const PREFIX = 'infidao-chain-v1:';
const copy = value => JSON.parse(JSON.stringify(value));

// Keep complete return snapshots on disk; only a small LRU stays in memory.
// Never silently evict an ancestor or a person's saved note to make a branch.
function createChainStore(api, { memoryLimit = 8, byteLimit = 3 * 1024 * 1024, prefix = PREFIX } = {}) {
  const INDEX = prefix + 'index';
  const memory = new Map();
  let index = {};
  try { index = api.getStorageSync ? api.getStorageSync(INDEX) || {} : {}; } catch (_) {}
  function retain(record, key = record.chain.chainId) {
    memory.delete(key); memory.set(key, record);
    while (memory.size > memoryLimit) memory.delete(memory.keys().next().value);
  }
  function get(id) {
    if (!id) return null;
    const record = memory.get(id) || (api.getStorageSync && api.getStorageSync(prefix + id));
    if (!record || !record.chain) return null;
    retain(record, id); return copy(record);
  }
  function put(chain, snapshot = {}, id = chain.chainId) {
    const record = copy({ chain, snapshot });
    const bytes = JSON.stringify(record).length * 3;
    const used = Object.values(index).reduce((sum, item) => sum + item.bytes, 0) - (index[id]?.bytes || 0);
    if (used + bytes > byteLimit) throw new Error('CHAIN_STORAGE_FULL');
    // Keep the old in-memory snapshot on a failed native storage write.
    const oldRecord = api.getStorageSync(prefix + id);
    api.setStorageSync(prefix + id, record);
    const previous = index[id];
    index[id] = { bytes, parentChainId: chain.parentChainId, entry: chain.entry, focus: chain.focus,
      chainId: chain.chainId, window: id !== chain.chainId, ordinal: chain.frames[0].ordinal };
    try { api.setStorageSync(INDEX, index); }
    catch (error) {
      if (previous) index[id] = previous; else delete index[id];
      try { if (oldRecord) api.setStorageSync(prefix + id, oldRecord); else api.removeStorageSync(prefix + id); } catch (_) {}
      throw error;
    }
    retain(record, id); return record;
  }
  function path(id) {
    const trail = [], seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id); const item = index[id]; if (!item) break;
      trail.unshift({ chainId: id, label: item.entry?.label || '最初的一念', focus: item.focus });
      id = item.parentChainId;
    }
    return trail;
  }
  function child(parentChainId, fromFrameId, anchorId) {
    // Word spelling alone is not identity: the same word can leave different
    // passages, senses and parents. Only revisit this exact traversed edge.
    const candidates = Object.values(index).filter(value => !value.window && value.parentChainId === parentChainId &&
      value.entry?.fromFrameId === fromFrameId && value.entry?.anchorId === anchorId).reverse();
    for (const item of candidates) {
      const saved = get(item.chainId);
      if (saved?.chain.frames.length && saved.chain.frames.every(frame => frame.ready !== false)) return saved;
    }
    return null;
  }
  function saveWindow(chain, snapshot) { return put(chain, snapshot, chain.chainId + ':window:' + chain.frames[0].ordinal); }
  function previousWindow(chainId, ordinal) {
    const item = Object.entries(index).filter(([, value]) => value.window && value.chainId === chainId && value.ordinal < ordinal)
      .sort((a, b) => b[1].ordinal - a[1].ordinal)[0];
    return item ? get(item[0]) : null;
  }
  return { get, put, path, child, saveWindow, previousWindow, stats: () => ({ memory: memory.size, saved: Object.keys(index).length }) };
}

module.exports = { createChainStore, PREFIX };
