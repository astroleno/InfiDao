const PREFIX = 'infidao-chain-v1:';
const copy = value => JSON.parse(JSON.stringify(value));

// Keep complete return snapshots on disk; only a small LRU caches disk records.
// Never silently evict an ancestor or a person's saved note to make a branch.
function createChainStore(api, { memoryLimit = 8, byteLimit = 3 * 1024 * 1024, prefix = PREFIX,
  allowTemporary = false, temporaryByteLimit = 3 * 1024 * 1024, onTemporary,
  autoPrune = false, archivedRoots = 2 } = {}) {
  const INDEX = prefix + 'index';
  const memory = new Map();
  // A full archive must not block reading. An opt-in, bounded overlay keeps
  // this session's complete return path without touching durable records.
  const temporaryRecords = new Map(), temporaryIndex = {};
  let temporary = false, temporaryBytes = 0;
  const protectedChains = new Set();
  let reconciled = false, reclaimed = 0;
  let index = {};
  try { index = api.getStorageSync ? api.getStorageSync(INDEX) || {} : {}; } catch (_) {}
  function retain(record, key = record.chain.chainId) {
    memory.delete(key); memory.set(key, record);
    while (memory.size > memoryLimit) memory.delete(memory.keys().next().value);
  }
  function get(id) {
    if (!id) return null;
    if (temporaryRecords.has(id)) return copy(temporaryRecords.get(id));
    const record = memory.get(id) || (api.getStorageSync && api.getStorageSync(prefix + id));
    if (!record || !record.chain) return null;
    protectedChains.add(record.chain.chainId);
    retain(record, id); return copy(record);
  }
  function put(chain, snapshot = {}, id = chain.chainId) {
    const record = copy({ chain, snapshot });
    const bytes = JSON.stringify(record).length * 3;
    const metadata = { bytes, parentChainId: chain.parentChainId, entry: chain.entry, focus: chain.focus,
      chainId: chain.chainId, window: id !== chain.chainId, ordinal: chain.frames[0].ordinal, updatedAt: Date.now() };
    protectedChains.add(chain.chainId);
    if (temporary) return putTemporary(record, metadata, id);
    try {
      if (autoPrune) { reconcile(); prune(metadata, id); }
      try { return putDurable(record, metadata, id); }
      catch (error) {
        // The device quota also includes other namespaces. Reclaim only our
        // inactive cache, then retry once before falling back to this session.
        if (!autoPrune || error.message === 'CHAIN_STORAGE_FULL' || !prune(metadata, id, true)) throw error;
        return putDurable(record, metadata, id);
      }
    }
    catch (error) {
      if (!allowTemporary) throw error;
      putTemporary(record, metadata, id);
      temporary = true;
      // Notification failures must not turn a successful save into an error.
      try { if (onTemporary) onTemporary(error); } catch (_) {}
      return record;
    }
  }
  function bytesUsed() { return Object.values(index).reduce((sum, item) => sum + (item.bytes || 0), 0); }
  function removeRecord(id) {
    memory.delete(id);
    try { api.removeStorageSync(prefix + id); reclaimed++; }
    catch (_) { reconciled = false; } // Retry orphan cleanup on the next write/launch.
  }
  function reconcile() {
    if (reconciled || !api.getStorageInfoSync) return;
    const keys = new Set(api.getStorageInfoSync().keys);
    const next = Object.fromEntries(Object.entries(index).filter(([id]) => keys.has(prefix + id)));
    // Commit the smaller index before removing payloads. Interrupted cleanup
    // leaves harmless orphan cache files, never dangling live return links.
    if (Object.keys(next).length !== Object.keys(index).length) {
      api.setStorageSync(INDEX, next); index = next;
    }
    reconciled = true;
    for (const key of keys) {
      if (key.startsWith(prefix) && key !== INDEX && !index[key.slice(prefix.length)]) removeRecord(key.slice(prefix.length));
    }
  }
  function rootOf(id, entries) {
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const parent = entries[id]?.parentChainId;
      if (!parent) return id;
      id = parent;
    }
    return Array.from(seen).sort()[0];
  }
  function prune(metadata, id, force = false) {
    // Never remove just one parent/window from a tree. Every chain touched in
    // this page lifetime protects its entire tree, including sibling branches.
    const entries = { ...index, ...temporaryIndex, [id]: metadata };
    const protectedRoots = new Set(Array.from(protectedChains, key => rootOf(key, entries)));
    const groups = new Map();
    for (const [key, item] of Object.entries(index)) {
      const root = rootOf(item.chainId || key, entries);
      if (protectedRoots.has(root)) continue;
      if (!groups.has(root)) groups.set(root, { ids: [], bytes: 0, updatedAt: 0 });
      const group = groups.get(root);
      group.ids.push(key); group.bytes += item.bytes || 0;
      group.updatedAt = Math.max(group.updatedAt, item.updatedAt || 0);
    }
    const candidates = Array.from(groups.values()).sort((a, b) => a.updatedAt - b.updatedAt);
    let projected = bytesUsed() - (index[id]?.bytes || 0) + metadata.bytes;
    const pressure = projected > byteLimit;
    const target = pressure ? byteLimit * 0.7 : byteLimit;
    const removing = [];
    let remaining = candidates.length;
    for (const group of candidates) {
      if (!force && remaining <= archivedRoots && projected <= target) break;
      // A single oversized node cannot fit even in an empty archive.
      if (metadata.bytes > byteLimit && remaining <= archivedRoots && !force) break;
      removing.push(...group.ids); projected -= group.bytes; remaining--;
    }
    if (!removing.length) return false;
    const next = { ...index };
    for (const key of removing) delete next[key];
    api.setStorageSync(INDEX, next);
    index = next;
    for (const key of removing) removeRecord(key);
    return true;
  }
  function putTemporary(record, metadata, id) {
    const used = temporaryBytes - (temporaryIndex[id]?.bytes || 0) + metadata.bytes;
    if (used > temporaryByteLimit) throw new Error('TEMPORARY_STORAGE_FULL');
    temporaryRecords.set(id, record); temporaryIndex[id] = metadata;
    temporaryBytes = used;
    return record;
  }
  function putDurable(record, metadata, id) {
    const used = bytesUsed() - (index[id]?.bytes || 0);
    if (used + metadata.bytes > byteLimit) throw new Error('CHAIN_STORAGE_FULL');
    // Keep the old in-memory snapshot on a failed native storage write.
    const oldRecord = api.getStorageSync(prefix + id);
    api.setStorageSync(prefix + id, record);
    const previous = index[id];
    index[id] = metadata;
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
      seen.add(id); const item = temporaryIndex[id] || index[id]; if (!item) break;
      trail.unshift({ chainId: id, label: item.entry?.label || '最初的一念', focus: item.focus });
      id = item.parentChainId;
    }
    return trail;
  }
  function child(parentChainId, fromFrameId, anchorId) {
    // Word spelling alone is not identity: the same word can leave different
    // passages, senses and parents. Only revisit this exact traversed edge.
    const candidates = Object.values({ ...index, ...temporaryIndex }).filter(value => !value.window && value.parentChainId === parentChainId &&
      value.entry?.fromFrameId === fromFrameId && value.entry?.anchorId === anchorId).reverse();
    for (const item of candidates) {
      const saved = get(item.chainId);
      if (saved?.chain.frames.length && saved.chain.frames.every(frame => frame.ready !== false)) return saved;
    }
    return null;
  }
  function saveWindow(chain, snapshot) { return put(chain, snapshot, chain.chainId + ':window:' + chain.frames[0].ordinal); }
  function previousWindow(chainId, ordinal) {
    const item = Object.entries({ ...index, ...temporaryIndex }).filter(([, value]) => value.window && value.chainId === chainId && value.ordinal < ordinal)
      .sort((a, b) => b[1].ordinal - a[1].ordinal)[0];
    return item ? get(item[0]) : null;
  }
  return { get, put, path, child, saveWindow, previousWindow,
    stats: () => ({ memory: memory.size, saved: Object.keys(index).length,
      bytes: bytesUsed(), reclaimed, temporary, temporaryBytes, temporarySaved: temporaryRecords.size }) };
}

module.exports = { createChainStore, PREFIX };
