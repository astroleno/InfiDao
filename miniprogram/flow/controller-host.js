const { createFlowController } = require('./generated/shared/controller');
const { requestId } = require('./remote-provider');

function recordFromNative(saved) {
  if (!saved) return null;
  const { __flowRecord, ...snapshot } = saved.snapshot || {};
  return { pathId: saved.chain.chainId, chain: saved.chain, snapshot,
    parentPathId: saved.chain.parentChainId || null, sourceLabel: saved.chain.entry?.label || '最初的一念',
    completion: saved.chain.frames.some(frame => frame.ready === false) ? 'pending' : 'complete',
    createdAt: 0, updatedAt: 0, ...__flowRecord };
}

function createNativeController(page) {
  const provider = { restore: chain => page._provider?.restore?.(chain) };
  for (const method of ['open', 'branch', 'next', 'resume']) {
    provider[method] = (input, hooks) => page._continuation[method](input, {
      onHead: chain => hooks?.onEvent?.({ type: 'head', chain, requestId: hooks.requestId }),
    });
  }
  const capture = () => {
    if (page.data.readingVisible) page.readerPositions()[page.data.sourceOpen ? 'source' : 'reading'] = page._readingScrollTop || 0;
    return page._timeline ? page.chainSnapshot() : {};
  };
  function put(record) {
    const { chain, snapshot, ...meta } = record;
    page._chainStore.put(chain, { ...snapshot, __flowRecord: meta });
    return { persisted: !page._chainStore.stats().temporary };
  }
  const controller = createFlowController({
    initialRecord: page._session ? recordFromNative({ chain: page._session, snapshot: capture() }) : null,
    createId: requestId, createPathId: chain => chain.chainId,
    cancelPresentation: () => page.beginAction?.(),
    defaultProvider: provider, providerFor: () => provider,
    initialSnapshot: () => null,
    capture, captureChain: chain => page._session?.chainId === chain.chainId ? page._session : chain,
    prepare: chain => page._chainFonts ? page._chainFonts.prepare(chain) : chain,
    storage: {
      put,
      get: id => recordFromNative(page._chainStore.get(id)),
      child: (id, frame, anchor) => recordFromNative(page._chainStore.child(id, frame, anchor)),
      commitBranch(parent, child) { put(parent); return put(child); },
    },
    present: (record, context) => page.presentChain(record.chain, record.snapshot, context.version),
    update: record => { page.replaceChainBatch(record.chain); page.trimChainWindow(); },
    state(state) {
      page._chainRequest = state.version;
      if (!page._alive) return;
      if (!state.pending && !state.error) page._retryOperation = null;
      page.setData({ chainBusy: state.busy, chainPending: state.pending, loading: !state.record && state.pending,
        chainError: state.record ? state.error?.message || '' : '', error: state.record ? '' : state.error?.message || '',
        chainErrorAction: state.error?.code === 'CONNECTION_REQUIRED' ? 'connect' : 'retry' });
      if (state.error) {
        page._spatialTransition = null;
        page.setData({ wordHit: null, pressedAnchor: '', transitionWord: '', branchLabel: '' });
      }
      page.syncMotion?.();
    },
  });
  return controller;
}

module.exports = { createNativeController, recordFromNative };
