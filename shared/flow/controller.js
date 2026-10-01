const { resolveSelection } = require('./classic-text');

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const incomplete = chain => chain.frames.some(frame => frame.ready === false);
const failure = (code, message) => Object.assign(new Error(message), { code });

function mergeChain(previous, batch) {
  if (!previous || previous.chainId !== batch.chainId) return copy(batch);
  const frames = new Map(previous.frames.map(frame => [frame.id, frame]));
  for (const frame of batch.frames) {
    const old = frames.get(frame.id);
    if (old && (old.quote !== frame.quote || old.sourceId !== frame.sourceId || old.textHash !== frame.textHash)) {
      throw failure('FRAME_CHANGED', '经句身份发生变化，已保留原来的阅读。');
    }
    if (!old || old.ready === false || frame.ready !== false) frames.set(frame.id, copy(frame));
  }
  const merged = { ...previous, ...batch, frames: Array.from(frames.values()).sort((a, b) => a.ordinal - b.ordinal) };
  const latest = Math.max(...previous.frames.map(frame => frame.ordinal));
  const batchLatest = Math.max(...batch.frames.map(frame => frame.ordinal));
  if (batch.frames.length && (batchLatest < latest || (batchLatest === latest && incomplete(batch) && !incomplete(previous)))) {
    merged.cursor = previous.cursor; merged.exhausted = previous.exhausted;
  }
  return merged;
}

function branchInput(chain, selected) {
  const frame = chain.frames.find(item => item.id === selected.frameId);
  const lexical = frame && selected.selection ? resolveSelection(frame, selected.selection) : null;
  const anchor = frame?.anchors.find(item => item.id === selected.anchorId);
  if (!frame || (selected.selection && !lexical) || (!lexical && !anchor)) {
    throw failure('STALE_SELECTION', '这个字词的位置已经变化，请重新选择。');
  }
  return { input: { chainId: chain.chainId, fromFrameId: frame.id, anchorId: lexical?.id || anchor.id,
    ...(lexical ? { selection: lexical.selection } : {}) }, label: lexical?.text || anchor.label };
}

/**
 * Platform-neutral reading coordinator. All storage calls may be asynchronous.
 * Ports: providerFor/defaultProvider, storage, prepare, capture, present, update,
 * state, history, createId and initialSnapshot. No DOM, Page, wx or render clock.
 */
function createFlowController(host) {
  let state = { record: host.initialRecord || null, busy: false, pending: false, error: null, storageWarning: false, version: 0 };
  let visible = true, disposed = false, active = null, retryOperation = null;
  let writes = Promise.resolve();
  const now = host.now || Date.now;
  const notify = patch => {
    state = { ...state, ...patch };
    if (!disposed) host.state?.({ ...state });
  };
  const current = token => !disposed && visible && token === state.version;
  const queueWrite = work => {
    const result = writes.then(work);
    writes = result.catch(() => {});
    return result;
  };
  const warn = result => { if (result?.persisted === false) notify({ storageWarning: true }); };
  const captured = record => ({ ...record,
    chain: copy(host.captureChain?.(record.chain) || record.chain),
    snapshot: copy(host.capture?.() || record.snapshot), updatedAt: now() });

  async function save(record, token) {
    return queueWrite(async () => {
      if (token !== undefined && !current(token)) return false;
      warn(await host.storage.put(copy(record)));
      return token === undefined || current(token);
    });
  }

  async function checkpoint() {
    if (!state.record) return;
    const record = captured(state.record);
    state = { ...state, record };
    await save(record);
  }

  function begin(method, input) {
    const previous = active;
    active = null;
    notify({ version: state.version + 1, error: null });
    previous?.task?.cancel?.();
    host.cancelPresentation?.();
    const context = { token: state.version, method, input, from: state.record, record: null,
      requestId: host.createId(), queue: Promise.resolve(), task: null, presented: false, lastBatch: '' };
    active = context;
    return context;
  }

  async function activate(record, context, navigation) {
    if (!current(context.token)) return;
    const guard = () => current(context.token);
    // The visual adapter may be asynchronous. Any cancellation during that
    // transition must checkpoint the incoming record, not the previous path.
    const previous = state.record;
    state = { ...state, record };
    context.record = record;
    try { await host.present?.(copy(record), { current: guard, version: context.token, navigation }); }
    catch (error) { if (guard()) { state = { ...state, record: previous }; context.record = null; } throw error; }
    if (!guard()) return;
    state = { ...state, record };
    context.record = record;
    context.presented = true;
    host.history?.(record.pathId, navigation);
    notify({ record, busy: false });
    await queueWrite(async () => {
      if (!guard() || state.record?.pathId !== record.pathId) return;
      warn(await host.storage.activate?.(record.pathId));
    });
  }

  async function deliver(batch, context, stage) {
    if (!current(context.token) || !batch?.frames) return;
    if (!batch.frames.length && !['next', 'resume'].includes(context.method)) throw failure('EMPTY_CHAIN', '暂未找到可接续的经文。');
    const fingerprint = JSON.stringify(batch);
    if (fingerprint === context.lastBatch) return;
    const chain = host.prepare ? await host.prepare(copy(batch)) : copy(batch);
    if (!current(context.token)) return;
    const existing = context.record || (['next', 'resume'].includes(context.method) ? state.record : null);
    if (existing) {
      if (existing.chain.chainId !== chain.chainId) throw failure('CHAIN_CHANGED', '返回的经文链与当前阅读不一致。');
      const base = state.record?.pathId === existing.pathId ? captured(state.record) : existing;
      const merged = mergeChain(base.chain, chain);
      const record = { ...base, chain: merged, completion: incomplete(merged) ? 'pending' : 'complete', updatedAt: now() };
      if (!await save(record, context.token)) return;
      context.record = record;
      state = { ...state, record };
      host.update?.(copy(record));
      notify({ record, busy: false });
    } else {
      const parent = context.method === 'branch' || context.method === 'restart' ? context.from : null;
      const parentSnapshot = parent && state.record?.pathId === parent.pathId ? captured(state.record).snapshot : parent?.snapshot;
      const record = { pathId: host.createPathId ? host.createPathId(chain) : host.createId(), chain, snapshot: copy(host.initialSnapshot(chain, { parentSnapshot: copy(parentSnapshot) })),
        parentPathId: parent?.pathId || null, sourceLabel: context.label || (chain.seed ? '此刻的一念' : '最初的经文'),
        completion: incomplete(chain) ? 'pending' : 'complete', createdAt: now(), updatedAt: now() };
      const stored = await queueWrite(async () => {
        if (!current(context.token)) return false;
        const latestParent = parent && state.record?.pathId === parent.pathId ? captured(state.record) : parent;
        const result = latestParent ? await host.storage.commitBranch(copy(latestParent), copy(record)) : await host.storage.put(copy(record));
        warn(result);
        return current(context.token);
      });
      if (!stored) return;
      await activate(record, context, context.navigation || 'push');
    }
    context.lastBatch = fingerprint;
    if (stage === 'frame') retryOperation = null;
  }

  function providerFor(chain) { return chain ? host.providerFor(chain) : host.defaultProvider; }

  async function execute(method, input, options = {}) {
    if (disposed || !visible) return;
    const context = begin(method, input);
    Object.assign(context, options);
    retryOperation = { method, input: copy(input), options };
    notify({ busy: method !== 'resume' && method !== 'next', pending: true });
    try {
      await checkpoint();
      context.from = state.record;
      if (!current(context.token)) return;
      const provider = options.provider || providerFor(context.from?.chain);
      if (options.visited) {
        const saved = await host.storage.child(context.from.pathId, input.fromFrameId, input.anchorId);
        if (!current(context.token)) return;
        if (saved && !incomplete(saved.chain)) {
          saved.chain = host.prepare ? await host.prepare(saved.chain) : saved.chain;
          if (!current(context.token)) return;
          providerFor(saved.chain).restore?.(saved.chain);
          await activate(saved, context, 'push');
          if (current(context.token)) { notify({ pending: false }); retryOperation = null; }
          return saved;
        }
      }
      const operation = method === 'restart' ? 'open' : method;
      if (!provider?.[operation]) throw failure('CONNECTION_REQUIRED', '这处联系需要联网后继续，原句仍可阅读。');
      context.task = provider[operation](input, { requestId: context.requestId, onEvent: event => {
        if (!current(context.token) || (event.requestId && event.requestId !== context.requestId)) return;
        if (event.type !== 'head' && event.type !== 'frame') return;
        context.queue = context.queue.then(() => deliver(event.chain, context, event.type));
        // Keep the rejection for the caller while avoiding unhandled async event errors.
        context.queue.catch(() => context.task?.cancel?.());
      } });
      const result = await context.task;
      await context.queue;
      if (!current(context.token)) return;
      await deliver(result, context, 'frame');
      if (current(context.token)) { notify({ busy: false, pending: false }); retryOperation = null; }
      return state.record;
    } catch (error) {
      // A provider may reject after emitting head; let that checkpoint finish first.
      try { await context.queue; } catch (preparationError) { error = preparationError; }
      if (!current(context.token) || error.cancelled || error.name === 'AbortError') return;
      if (!state.record && method === 'open' && host.fallbackProvider && options.provider !== host.fallbackProvider && !options.fallback) {
        return execute('open', typeof input === 'string' ? input : input.seed || '', {
          ...options, provider: host.fallbackProvider, fallback: true,
        });
      }
      if (context.record && incomplete(context.record.chain)) {
        const record = { ...captured(context.record), completion: 'failed' };
        try { if (await save(record, context.token)) state = { ...state, record }; } catch (_) { notify({ storageWarning: true }); }
      }
      notify({ busy: false, pending: false, error: { code: error.code || error.message || 'UNAVAILABLE',
        message: error.message && !/^[A-Z_]+$/.test(error.message) ? error.message : '这条联系暂未展开，原句仍可阅读。' } });
    } finally {
      if (active === context) active = null;
    }
  }

  async function restore(pathId, options = {}) {
    const context = begin('restore', pathId);
    notify({ busy: true, pending: false });
    try {
      await checkpoint();
      const saved = options.record ? copy(options.record) : await host.storage.get(pathId);
      if (!current(context.token)) return;
      if (!saved) {
        if (!state.record) {
          const fallbackVersion = state.version + 1;
          await execute('open', '', { provider: host.fallbackProvider || host.defaultProvider, navigation: 'replace', fallback: true });
          if (current(fallbackVersion)) notify({ error: { code: 'PATH_MISSING', message: '这条本机来路已不可用，已打开本地精选。' } });
          return;
        }
        throw failure('PATH_MISSING', '未找到这次阅读的位置，当前经文仍在。');
      }
      saved.chain = host.prepare ? await host.prepare(saved.chain) : saved.chain;
      if (!current(context.token)) return;
      providerFor(saved.chain).restore?.(saved.chain);
      await activate(saved, context, options.navigation || 'restore');
      if (!current(context.token)) return;
      notify({ busy: false, pending: false, error: null });
      retryOperation = null;
      if (incomplete(saved.chain) && (!saved.completion || saved.completion === 'pending')) {
        return execute('resume', { chainId: saved.chain.chainId });
      }
    } catch (error) {
      if (current(context.token)) notify({ busy: false, pending: false, error: { code: error.code || 'RESTORE_FAILED', message: error.message } });
    } finally { if (active === context) active = null; }
  }

  function cancel(manual = true) {
    const previous = active;
    active = null;
    notify({ version: state.version + 1, busy: false, pending: false });
    previous?.task?.cancel?.();
    host.cancelPresentation?.();
    if (manual && state.record && incomplete(state.record.chain)) {
      const record = { ...captured(state.record), completion: 'stopped' };
      state = { ...state, record };
      save(record).catch(() => notify({ storageWarning: true }));
      notify({ record, error: { code: 'INCOMPLETE', message: '这条联系尚未展开完整，可以再试或返回。' } });
    }
  }

  return {
    getState: () => ({ ...state }), current,
    checkpoint,
    open: (seed, options) => execute('open', seed, { provider: host.defaultProvider, ...options }),
    curated: seed => execute('open', seed || '', { provider: host.fallbackProvider, navigation: state.record ? 'push' : 'replace', fallback: true }),
    async start(pathId) {
      const version = state.version;
      const path = pathId || await host.storage.latest?.();
      if (!current(version)) return;
      if (path) return restore(path, { navigation: pathId ? 'restore' : 'replace' });
      return execute('open', '', { provider: host.defaultProvider, navigation: 'replace' });
    },
    branch(selected) {
      if (!state.record || state.busy) return Promise.resolve();
      try {
        const { input, label } = branchInput(state.record.chain, selected);
        return execute('branch', input, { visited: true, label: `沿「${label}」` });
      } catch (error) { notify({ error: { code: error.code, message: error.message } }); return Promise.resolve(); }
    },
    next() {
      const chain = state.record?.chain;
      if (!chain?.cursor || chain.exhausted || incomplete(chain) || state.pending || state.busy || (state.error && retryOperation?.method === 'next')) return Promise.resolve();
      return execute('next', { chainId: chain.chainId, cursor: chain.cursor });
    },
    resume() {
      if (!state.record || !incomplete(state.record.chain)) return Promise.resolve();
      return execute('resume', { chainId: state.record.chain.chainId });
    },
    restart(selected) {
      const record = state.record, frame = record?.chain.frames.find(item => item.id === selected?.frameId) || record?.chain.frames[0];
      if (!frame) return Promise.resolve();
      try {
        const lexical = selected?.selection ? branchInput(record.chain, selected).input.selection : null;
        return execute('restart', { seed: record.chain.seed, restartFrom: { sourceId: frame.sourceId,
          corpusVersion: frame.corpusVersion, textHash: frame.textHash, quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd },
          ...(lexical ? { selection: lexical } : {}) }, { provider: host.defaultProvider, label: lexical ? '沿原词重新展开' : '从原句重新展开' });
      } catch (error) { notify({ error: { code: error.code, message: error.message } }); return Promise.resolve(); }
    },
    restore, cancel,
    retry() {
      if (state.record && incomplete(state.record.chain)) return execute('resume', { chainId: state.record.chain.chainId });
      if (retryOperation) return execute(retryOperation.method, retryOperation.input, retryOperation.options);
      return Promise.resolve();
    },
    dismissError: () => notify({ error: null }),
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      if (!value) { checkpoint().catch(() => notify({ storageWarning: true })); cancel(false); }
      else if (state.record && incomplete(state.record.chain) && state.record.completion === 'pending') {
        void execute('resume', { chainId: state.record.chain.chainId });
      }
      else if (!state.record && retryOperation) void execute(retryOperation.method, retryOperation.input, retryOperation.options);
    },
    dispose() { cancel(false); disposed = true; },
  };
}

module.exports = { createFlowController, mergeChain, branchInput };
