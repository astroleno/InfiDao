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
    // A delayed checkpoint may arrive after a longer stream prefix or the
    // complete frame. It is an earlier observation, not changed settled text.
    if (old && frame.ready === false && (old.ready !== false ||
      ['meaning', 'reflection'].some(surface => old[surface]?.length > (frame[surface]?.length || 0) &&
        old[surface].startsWith(frame[surface] || '')))) continue;
    for (const surface of ['meaning', 'reflection']) {
      if (old?.settled?.[surface] && old[surface] !== frame[surface]) {
        throw failure('FRAME_CHANGED', '已读的段落发生变化，已保留原来的阅读。');
      }
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
  const background = new Set();
  const contexts = new Set();
  let writes = Promise.resolve();
  const now = host.now || Date.now;
  const notify = patch => {
    state = { ...state, ...patch };
    if (!disposed) host.state?.({ ...state });
  };
  const current = token => !disposed && visible && token === state.version;
  const available = context => current(context.token) || (!disposed && visible && background.has(context) && !context.cancelled);
  const queueWrite = work => {
    const result = writes.then(work);
    writes = result.catch(() => {});
    return result;
  };
  const warn = result => { if (result?.persisted === false) notify({ storageWarning: true }); };
  const captured = record => ({ ...record,
    chain: copy(host.captureChain?.(record.chain) || record.chain),
    snapshot: copy(host.capture?.() || record.snapshot), updatedAt: now() });

  async function save(record, token, allowed = () => true) {
    return queueWrite(async () => {
      if (!allowed() || (token !== undefined && !current(token))) return false;
      warn(await host.storage.put(copy(record)));
      return allowed() && (token === undefined || current(token));
    });
  }

  async function checkpoint() {
    if (!state.record) return;
    const record = captured(state.record);
    state = { ...state, record };
    await save(record);
  }

  function stop(context, retain = false) {
    if (!context) return;
    context.cancelled = true;
    background.delete(context);
    context.task?.cancel?.();
    // Already received, verified events finish their durable writes even when
    // a newer click supersedes presentation. Incomplete detached paths remain
    // explicitly resumable instead of silently restarting on a later visit.
    if (retain && host.backgroundLimit) void context.queue.then(async () => {
      if (!context.discardPending && context.record && incomplete(context.record.chain)) {
        await save({ ...context.record, completion: 'stopped', updatedAt: now() });
      }
    }).catch(() => notify({ storageWarning: true }));
  }

  function begin(method, input) {
    if (method !== 'next') providerFor(state.record?.chain)?.cancelPreparation?.();
    const previous = active;
    active = null;
    if (host.backgroundLimit && ['branch', 'restart'].includes(method) && previous?.task) {
      background.add(previous);
      while (background.size > host.backgroundLimit) stop(background.values().next().value, true);
    } else stop(previous, true);
    if (method === 'restore' || method === 'open') for (const context of background) stop(context, true);
    notify({ version: state.version + 1, error: null });
    host.cancelPresentation?.();
    const context = { token: state.version, method, input, from: state.record, record: null,
      requestId: host.createId(), queue: Promise.resolve(), task: null, presented: false, lastBatch: '' };
    active = context;
    contexts.add(context);
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

  async function deliver(batch, context, stage, received = false) {
    const durable = !!host.backgroundLimit && (received || background.has(context));
    if (context.discardPending || (!available(context) && !durable) || !batch?.frames) return;
    if (!batch.frames.length && !['next', 'resume'].includes(context.method)) throw failure('EMPTY_CHAIN', '暂未找到可接续的经文。');
    const fingerprint = JSON.stringify(batch);
    if (fingerprint === context.lastBatch) return;
    const chain = host.prepare && current(context.token) ? await host.prepare(copy(batch)) : copy(batch);
    if (context.discardPending || (!available(context) && !durable)) return;
    const existing = context.record || (['next', 'resume'].includes(context.method) ? context.from : null);
    if (existing) {
      if (existing.chain.chainId !== chain.chainId) throw failure('CHAIN_CHANGED', '返回的经文链与当前阅读不一致。');
      const base = state.record?.pathId === existing.pathId ? captured(state.record) : existing;
      const merged = mergeChain(base.chain, chain);
      const record = { ...base, chain: merged, completion: incomplete(merged) ? 'pending' : 'complete', recoveryError: undefined, updatedAt: now() };
      if (!await save(record, durable ? undefined : context.token, () => !context.discardPending)) return;
      context.record = record;
      if (current(context.token)) {
        state = { ...state, record };
        host.update?.(copy(record));
        notify({ record, busy: false });
      } else if (state.record?.pathId === record.pathId && !disposed) {
        state = { ...state, record };
        host.update?.(copy(record));
      } else if (!disposed) host.background?.(copy(record));
    } else {
      const parent = context.method === 'branch' || context.method === 'restart' ? context.from : null;
      const parentSnapshot = parent && state.record?.pathId === parent.pathId ? captured(state.record).snapshot : parent?.snapshot;
      const record = { pathId: host.createPathId ? host.createPathId(chain) : host.createId(), chain, snapshot: copy(host.initialSnapshot(chain, { parentSnapshot: copy(parentSnapshot) })),
        parentPathId: parent?.pathId || null, sourceLabel: context.label || (chain.seed ? '此刻的一念' : '最初的经文'),
        ...(parent && context.parentEntry ? { parentEntry: copy(context.parentEntry) } : {}),
        completion: incomplete(chain) ? 'pending' : 'complete', createdAt: now(), updatedAt: now() };
      const stored = await queueWrite(async () => {
        if (context.discardPending || (!current(context.token) && !durable)) return false;
        const latestParent = parent && state.record?.pathId === parent.pathId ? captured(state.record) : parent;
        const result = latestParent ? await host.storage.commitBranch(copy(latestParent), copy(record)) : await host.storage.put(copy(record));
        warn(result);
        return !context.discardPending && (durable || current(context.token));
      });
      if (!stored) return;
      context.record = record;
      if (current(context.token)) await activate(record, context, context.navigation || 'push');
      else if (!disposed) host.background?.(copy(record));
    }
    context.lastBatch = fingerprint;
    if (stage === 'frame' && current(context.token)) retryOperation = null;
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
      // Visible earlier paragraphs still belong to their original server chain.
      // Resolve their owner without presenting/restoring it as a separate view.
      if (options.sourcePathId && options.sourcePathId !== context.from?.pathId) {
        context.from = await host.storage.get(options.sourcePathId);
        if (!current(context.token)) return;
        if (!context.from) throw failure('PATH_MISSING', '未找到这段经文的来路，当前阅读仍在。');
      }
      if (method === 'branch' && options.selected) {
        const chosen = branchInput(context.from.chain, options.selected);
        input = chosen.input;
        context.input = input;
        context.label = `沿「${chosen.label}」`;
        context.parentEntry = { fromFrameId: input.fromFrameId, anchorId: input.anchorId, label: chosen.label,
          ...(input.selection ? { selection: copy(input.selection) } : {}) };
      }
      const provider = options.provider || providerFor(context.from?.chain);
      if (options.visited) {
        const entry = context.parentEntry || input;
        const saved = await host.storage.child(context.from.pathId, entry.fromFrameId, entry.anchorId, entry.selection || input.selection);
        warn(host.storage.status?.());
        if (!current(context.token)) return;
        const sameScope = !host.contentPacks || JSON.stringify((saved?.chain.contentScope?.packIds || ['core']).slice().sort()) === JSON.stringify(host.contentPacks().slice().sort());
        if (saved && sameScope && !incomplete(saved.chain)) {
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
      if (method === 'branch' && host.branchDelayMs) {
        await new Promise(resolve => setTimeout(resolve, host.branchDelayMs));
        if (!current(context.token)) return;
      }
      context.task = provider[operation](input, { requestId: context.requestId, onEvent: event => {
        if (!available(context) || (event.requestId && event.requestId !== context.requestId)) return;
        if (!['head', 'progress', 'frame'].includes(event.type)) return;
        context.queue = context.queue.then(() => deliver(event.chain, context, event.type, true));
        // Keep the rejection for the caller while avoiding unhandled async event errors.
        context.queue.catch(() => context.task?.cancel?.());
      } });
      const result = await context.task;
      await context.queue;
      if (!available(context) && !host.backgroundLimit) return;
      await deliver(result, context, 'frame', true);
      if (current(context.token)) { notify({ busy: false, pending: false }); retryOperation = null; }
      return state.record;
    } catch (error) {
      // A provider may reject after emitting head; let that checkpoint finish first.
      try { await context.queue; } catch (preparationError) { error = preparationError; }
      if (!current(context.token)) {
        if (host.backgroundLimit && context.record && incomplete(context.record.chain) && !context.cancelled) {
          const recoveryError = { code: error.code || 'UNAVAILABLE', message: error.message || '这条联系尚未展开完整，可以重试。' };
          await save({ ...context.record, completion: 'failed', recoveryError, updatedAt: now() }).catch(() => notify({ storageWarning: true }));
        }
        return;
      }
      if (error.cancelled || error.name === 'AbortError') return;
      // The reader already chose an exact word or continuation. An expired
      // remote cursor must not turn that one action into an error-and-retry UI.
      // Reopen once from canonical source; never restart background restores,
      // changed source text, quotas, or a request which already delivered data.
      if (['branch', 'next'].includes(method) && !context.record && context.from &&
        ['CHAIN_EXPIRED', 'ANCHOR_EXPIRED', 'CONNECTION_REQUIRED'].includes(error.code) &&
        (error.code !== 'CONNECTION_REQUIRED' || providerFor(context.from.chain) !== host.defaultProvider)) {
        const selected = method === 'branch'
          ? { frameId: input.fromFrameId, anchorId: input.anchorId, ...(input.selection ? { selection: input.selection } : {}) }
          : { frameId: context.from.chain.frames[context.from.chain.frames.length - 1]?.id };
        return restart(selected, { parentEntry: context.parentEntry, label: context.label, sourceRecord: context.from });
      }
      if (!state.record && method === 'open' && host.fallbackProvider && options.provider !== host.fallbackProvider && !options.fallback) {
        return execute('open', typeof input === 'string' ? input : input.seed || '', {
          ...options, provider: host.fallbackProvider, fallback: true,
        });
      }
      // A restored head exists before resume begins. Persist its failure too,
      // so visibility changes and reloads do not repeatedly resume it.
      const failedRecord = context.record || (method === 'resume' ? state.record : null);
      const recoveryError = { code: error.code || error.message || 'UNAVAILABLE',
        message: error.message && !/^[A-Z_]+$/.test(error.message) ? error.message : '这条联系暂未展开，原句仍可阅读。' };
      if (failedRecord && incomplete(failedRecord.chain)) {
        const record = { ...captured(failedRecord), completion: 'failed', recoveryError };
        try { if (await save(record, context.token)) state = { ...state, record }; } catch (_) { notify({ storageWarning: true }); }
      }
      notify({ busy: false, pending: false, error: recoveryError });
    } finally {
      contexts.delete(context);
      background.delete(context);
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
      if (options.resumeIncomplete === false && incomplete(saved.chain) && (!saved.completion || saved.completion === 'pending')) {
        saved.completion = 'stopped';
        if (!await save(saved, context.token)) return;
      }
      saved.chain = host.prepare ? await host.prepare(saved.chain) : saved.chain;
      if (!current(context.token)) return;
      providerFor(saved.chain).restore?.(saved.chain);
      await activate(saved, context, options.navigation || 'restore');
      if (!current(context.token)) return;
      notify({ busy: false, pending: false, error: incomplete(saved.chain) && (options.resumeIncomplete === false || ['failed', 'stopped'].includes(saved.completion))
        ? saved.recoveryError || { code: 'INCOMPLETE', message: '这条联系尚未展开完整，可以再试或返回。' } : null });
      retryOperation = null;
      if (options.resumeIncomplete !== false && incomplete(saved.chain) && (!saved.completion || saved.completion === 'pending')) {
        return execute('resume', { chainId: saved.chain.chainId });
      }
    } catch (error) {
      if (current(context.token)) notify({ busy: false, pending: false, error: { code: error.code || 'RESTORE_FAILED', message: error.message } });
    } finally { contexts.delete(context); if (active === context) active = null; }
  }

  function cancel(manual = true, { discardPending = false } = {}) {
    // Changing the reader's source selection invalidates even verified events
    // waiting on preparation or IndexedDB. Ordinary navigation still lets its
    // accepted background checkpoints finish.
    if (discardPending) for (const context of contexts) context.discardPending = true;
    const provider = providerFor(state.record?.chain);
    if (manual) provider?.cancelPreparation?.();
    else provider?.suspendPreparation?.();
    const previous = active;
    active = null;
    notify({ version: state.version + 1, busy: false, pending: false });
    stop(previous, manual);
    for (const context of background) stop(context, true);
    host.cancelPresentation?.();
    if (manual && state.record && incomplete(state.record.chain)) {
      const record = { ...captured(state.record), completion: 'stopped' };
      state = { ...state, record };
      save(record).catch(() => notify({ storageWarning: true }));
      notify({ record, error: { code: 'INCOMPLETE', message: '这条联系尚未展开完整，可以再试或返回。' } });
    } else if (discardPending && state.record) {
      // An IndexedDB write already in progress cannot be aborted here. Queue
      // the last visible snapshot behind it so reloads also keep that boundary.
      save(captured(state.record)).catch(() => notify({ storageWarning: true }));
    }
  }

  function restart(selected, options = {}) {
    const record = options.sourceRecord || state.record, frame = options.sourceFrame || record?.chain.frames.find(item => item.id === selected?.frameId) || record?.chain.frames[0];
    if (!frame) return Promise.resolve();
    try {
      const chosen = selected && (selected.selection || selected.anchorId) ? branchInput(record.chain, selected) : null;
      const lexical = options.sourceSelection || chosen?.input.selection;
      const anchor = frame.anchors.find(item => item.id === selected?.anchorId);
      const surface = lexical?.surface || anchor?.surface;
      // Former explanations are reading intent, never trusted ancient text.
      const seed = options.seed !== undefined ? options.seed : surface && surface !== 'quote'
        ? `沿「${chosen.label}」继续。这是经句「${frame.quote}」的${surface === 'meaning' ? '现代释义' : '生成联系'}中的词。`.slice(0, 120)
        : record.chain.seed;
      const parentEntry = options.parentEntry || (options.rescope ? { fromFrameId: frame.id, anchorId: 'scope:' + (host.contentPacks?.() || ['core']).join(',') + ':' + frame.sourceId + ':' + (lexical?.start ?? '') + ':' + (lexical?.end ?? ''), label: options.label || '按新范围继续' } : chosen ? { fromFrameId: frame.id, anchorId: chosen.input.anchorId, label: chosen.label,
        ...(lexical ? { selection: copy(lexical) } : {}) } : null);
      return execute('restart', { seed, restartFrom: { sourceId: frame.sourceId,
        corpusVersion: frame.corpusVersion, textHash: frame.textHash, quoteStart: frame.quoteStart, quoteEnd: frame.quoteEnd },
        ...(options.rescope && record.chain.kind === 'remote' ? { rebaseFrom: { chainId: record.chain.chainId, frameId: frame.id } } : {}),
        ...(lexical && !lexical.surface ? { selection: lexical } : {}) }, { provider: host.defaultProvider,
        sourcePathId: record.pathId,
        ...(parentEntry ? { parentEntry, visited: !parentEntry.thought } : {}),
        label: options.label || (chosen ? `沿「${chosen.label}」` : '从原句重新展开') });
    } catch (error) { notify({ error: { code: error.code, message: error.message } }); return Promise.resolve(); }
  }

  return {
    getState: () => ({ ...state }), current,
    checkpoint,
    open: (seed, options) => execute('open', seed, { provider: host.defaultProvider, ...options }),
    async think(seed, selected) {
      const thought = String(seed || '').trim().slice(0, 120);
      if (!thought) return;
      const version = state.version;
      const record = selected?.pathId && selected.pathId !== state.record?.pathId
        ? await host.storage.get(selected.pathId) : state.record;
      if (!current(version)) return;
      const frame = record?.chain.frames.find(item => item.id === selected?.frameId) || record?.chain.frames[0];
      if (!record || !frame) return execute('open', thought, { provider: host.defaultProvider });
      return restart({ frameId: frame.id }, { sourceRecord: record, seed: thought, label: '添一念',
        parentEntry: { fromFrameId: frame.id, anchorId: 'thought:' + host.createId(), label: '添一念', thought } });
    },
    curated: seed => execute('open', seed || '', { provider: host.fallbackProvider, navigation: state.record ? 'push' : 'replace', fallback: true }),
    async start(pathId) {
      const version = state.version;
      const path = pathId || await host.storage.latest?.();
      if (!current(version)) return;
      if (path) return restore(path, { navigation: pathId ? 'restore' : 'replace' });
      return execute('open', '', { provider: host.defaultProvider, navigation: 'replace' });
    },
    branch(selected) {
      if (!state.record) return Promise.resolve();
      try {
        const sourcePathId = selected.pathId || state.record.pathId;
        if (active?.method === 'branch' && active.sourcePathId === sourcePathId &&
          active.selected?.frameId === selected.frameId &&
          active.selected?.anchorId === selected.anchorId &&
          JSON.stringify(active.selected?.selection) === JSON.stringify(selected.selection)) return Promise.resolve();
        if (sourcePathId !== state.record.pathId) {
          return execute('branch', {}, { visited: true, sourcePathId, selected: copy(selected) });
        }
        const { input, label } = branchInput(state.record.chain, selected);
        if (active?.method === 'branch' && active.input.chainId === input.chainId &&
          active.input.fromFrameId === input.fromFrameId && active.input.anchorId === input.anchorId) return Promise.resolve();
        return execute('branch', input, { visited: true, sourcePathId, selected: copy(selected), label: `沿「${label}」`,
          parentEntry: { fromFrameId: input.fromFrameId, anchorId: input.anchorId, label,
            ...(input.selection ? { selection: copy(input.selection) } : {}) } });
      } catch (error) { notify({ error: { code: error.code, message: error.message } }); return Promise.resolve(); }
    },
    next() {
      const chain = state.record?.chain;
      if (!chain?.cursor || !chain.frames.length || chain.exhausted || incomplete(chain) || state.pending || state.busy || (state.error && retryOperation?.method === 'next')) return Promise.resolve();
      return execute('next', { chainId: chain.chainId, cursor: chain.cursor }, { visited: true, label: '沿此意继续',
        parentEntry: { fromFrameId: chain.frames[chain.frames.length - 1].id, anchorId: 'next:' + chain.cursor, label: '沿此意继续' } });
    },
    prepareNext() {
      const chain = state.record?.chain;
      if (!visible || disposed || state.pending || state.busy || state.error || !chain?.cursor ||
        chain.kind !== 'remote' || chain.exhausted || !chain.frames.length || incomplete(chain)) return;
      providerFor(chain)?.prepareNext?.({ chainId: chain.chainId, cursor: chain.cursor });
    },
    cancelPreparation: () => providerFor(state.record?.chain)?.cancelPreparation?.(),
    resume() {
      if (!state.record || !incomplete(state.record.chain)) return Promise.resolve();
      return execute('resume', { chainId: state.record.chain.chainId });
    },
    restart,
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
    dispose() { cancel(false); providerFor(state.record?.chain)?.cancelPreparation?.(); disposed = true; },
  };
}

module.exports = { createFlowController, mergeChain, branchInput };
