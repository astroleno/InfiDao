const { createChainProvider } = require('./chain-provider');
const { createChainStore } = require('./chain-store');
const { createContinuation } = require('./continuation');
const { createChainFonts } = require('./chain-fonts');
const { FlowTimeline, CELL, CENTER_PHASE } = require('./timeline');
const { readingLines } = require('./scene');
const { createRequestBudget } = require('./request-budget');

const chainActions = {
  initChains(api) {
    api = createRequestBudget(api);
    this._networkBudget = api;
    this._provider = createChainProvider(api);
    this._chainStore = createChainStore(api);
    this._chainFonts = createChainFonts(api, this._provider.origin || '');
    this._continuation = createContinuation(this._provider, chain => this._chainFonts.prepare(chain));
    this._chainRequest = 0;
  },
  chainSnapshot() {
    const visible = new Set((this._session?.frames || []).map(frame => frame.id));
    return { position: this._timeline.position, rowOffset: this._timeline.rowOffset,
      ambientPhase: this._timeline.ambientPhase, paused: this.data.paused,
      sourceOpen: this.data.sourceOpen, readingScroll: this._readingScrollTop || 0,
      readingPositions: Object.fromEntries(Object.entries(this._readingPositions || {}).filter(([id]) => visible.has(id))), windowStart: this._windowStart || 0 };
  },
  saveChain() {
    if (!this._session?.chainId) return;
    if (this.data.readingVisible) this.readerPositions()[this.data.sourceOpen ? 'source' : 'reading'] = this._readingScrollTop || 0;
    this._chainStore.put(this._session, this.chainSnapshot());
  },
  async openChainSession(seed) {
    const token = ++this._chainRequest;
    this._resumeSeed = seed;
    this._retryOperation = { type: 'open', seed };
    this._nextRequest = null;
    this._nextBatch = null;
    try { this.saveChain(); } catch (_) { this.setData({ chainError: '当前阅读未能保存，请整理本机空间后再试。' }); return; }
    this.setData({ loading: !this._session, chainBusy: true, chainError: '', error: '', inputFocus: false, overlayVisible: false });
    this.syncMotion();
    let headTransition;
    try {
      const chain = await this._continuation.open(seed, { onHead: head => {
        if (!this.chainCurrent(token)) return;
        headTransition = this.presentChain(head, null, token).then(() => {
          if (this.chainCurrent(token)) { this.setData({ chainBusy: false }); this.syncMotion(); }
        });
      } });
      if (headTransition) await headTransition;
      if (!this.chainCurrent(token)) return;
      if (this._session?.chainId === chain.chainId) this.replaceChainBatch(chain);
      else await this.presentChain(chain, null, token);
      if (this.chainCurrent(token)) { this._resumeSeed = undefined; this._retryOperation = null; }
    } catch (error) { this.chainFailure(error, token); }
  },
  chainCurrent(token) { return this._alive && this._visible && token === this._chainRequest; },
  chainFailure(error, token) {
    if (!this.chainCurrent(token) || error.cancelled) return;
    const message = error.message === 'CHAIN_STORAGE_FULL' ? '本机阅读记录已满，原句仍在。' :
      error.message && !/^[A-Z_]+$/.test(error.message) ? error.message : '这条联系暂未展开，原句仍可阅读。';
    this.setData({ chainBusy: false, loading: false, chainError: this._session ? message : '', error: this._session ? '' : message });
    this._resumeSeed = undefined;
    this.syncMotion();
  },
  async branchFromWord(event) {
    if (this.data.chainBusy || !this._session?.chainId) return;
    const detail = event.detail || {}, frameId = detail.frameId || event.currentTarget?.dataset.frame,
      anchorId = detail.anchorId || event.currentTarget?.dataset.anchor;
    const frame = this._session.frames.find(item => item.id === frameId);
    if (!frame?.anchors.some(anchor => anchor.id === anchorId)) return;
    const token = ++this._chainRequest;
    this._nextRequest = null;
    this._nextBatch = null;
    try { this.saveChain(); } catch (error) { this.chainFailure(error, token); return; }
    const input = { chainId: this._session.chainId, fromFrameId: frameId, anchorId };
    this._lastBranch = input;
    this._retryOperation = { type: 'branch', input };
    this._branchPressedAt = Date.now();
    this.setData({ chainBusy: true, chainError: '', branchLabel: frame.anchors.find(anchor => anchor.id === anchorId).label });
    this.syncMotion(); this.pulse();
    let headTransition;
    try {
      const chain = await this._continuation.branch(input, { onHead: head => {
        if (this.chainCurrent(token)) headTransition = this.presentChain(head, null, token);
      } });
      if (headTransition) await headTransition;
      if (!this.chainCurrent(token)) return;
      if (this._session?.chainId === chain.chainId) this.replaceChainBatch(chain);
      else await this.presentChain(chain, null, token);
      if (this.chainCurrent(token)) this._retryOperation = null;
    } catch (error) { this.chainFailure(error, token); }
  },
  async presentChain(chain, snapshot, token) {
    if (!chain.frames.length || !this.chainCurrent(token)) return;
    // Save before replacing anything. Storage exhaustion cannot destroy the
    // only snapshot of the parent or leave a non-returnable branch onscreen.
    this._chainStore.put(chain, snapshot || {});
    if (this._renderer && !this.data.snapshotReady) {
      const action = this.beginAction();
      await new Promise(resolve => { this._resolveChainCapture = resolve; this.captureScene(action, resolve); });
      this._resolveChainCapture = null;
      if (!this.chainCurrent(token)) return;
    }
    this._continuation.cancelUnrelated(chain.chainId);
    if (this._provider.restore) this._provider.restore(chain);
    this._session = chain;
    this._readingLines = readingLines(chain.frames);
    this._timeline = new FlowTimeline(this._readingLines.length);
    this._timeline.loop = true;
    this._windowStart = snapshot?.windowStart || 0;
    if (snapshot) for (const key of ['position', 'rowOffset', 'ambientPhase']) this._timeline[key] = snapshot[key] || 0;
    this._timeline.setVisible(this._visible);
    this._readingPositions = snapshot?.readingPositions || {};
    this._readingScrollTop = snapshot?.readingScroll || 0;
    const paused = !!snapshot?.paused || !!this._reducedMotion || !!chain.fontUnavailable;
    this.setData({ loading: false, chainBusy: !chain.frames[0].ready, chainError: '', overlay: '', inputFocus: false,
      seed: chain.seed, personalSeed: chain.seedOrigin === 'user', paused, phase: 'entering', readingVisible: false,
      sourceOpen: !!snapshot?.sourceOpen, sourceMounted: !!snapshot?.sourceOpen,
      sceneShift: snapshot?.sourceOpen ? this.data.detailShift : 0, keyboardHeight: 0,
      chainId: chain.chainId, chainParent: chain.parentChainId || '', chainLabel: chain.entry?.label || '',
      chainPath: this._chainStore.path(chain.chainId), chainKind: chain.kind,
      total: chain.exhausted ? String(chain.frames[chain.frames.length - 1].ordinal).padStart(2, '0') : '…' });
    this.updateActive(true);
    const finish = () => {
      if (!this.chainCurrent(token)) return;
      this._branchReadableMs = this._branchPressedAt ? Date.now() - this._branchPressedAt : null;
      this._branchPressedAt = null;
      if (paused) {
        this.setData({ phase: 'reading', readingVisible: true });
        this.scrollReader(this._readingScrollTop);
      } else {
        const action = this._action;
        this.revealLive(action, () => { this.setData({ phase: 'flow' }); this.syncMotion(); });
      }
      this.refreshChainLinks();
    };
    if (chain.fontUnavailable) { this.graphicsFailed(new Error('Font unavailable')); return; }
    if (!this._renderer || this.data.graphicsError) { this.setData({ graphicsError: false }); this.initRenderer(); return; }
    const action = this.beginAction();
    this._renderer.stop(); this._renderer.timeline = this._timeline;
    this._renderer.reading = paused ? 1 : 0;
    try {
      this._renderer.setFrames(this._readingLines);
      await new Promise(resolve => { this._resolveChainCapture = resolve; this.captureScene(action, () => { finish(); resolve(); }); });
      this._resolveChainCapture = null;
    } catch (error) { this.graphicsFailed(error); }
  },
  replaceChainBatch(batch) {
    if (this._session.chainId !== batch.chainId) return;
    const existing = new Map(this._session.frames.map(frame => [frame.id, frame]));
    for (const frame of batch.frames) existing.set(frame.id, frame);
    this._session = { ...batch, frames: Array.from(existing.values()) };
    this._readingLines = readingLines(this._session.frames);
    this._timeline.count = this._readingLines.length;
    this.setData({ chainBusy: false, chainError: '', total: batch.exhausted ? String(this._session.frames[this._session.frames.length - 1].ordinal).padStart(2, '0') : '…' });
    if (batch.fontUnavailable) { this.graphicsFailed(new Error('Font unavailable')); return; }
    if (this._renderer) this._renderer.setFrames(this._readingLines);
    this.updateActive(true); this.syncMotion();
  },
  refreshChainLinks() {
    if (!this._session?.chainId || !this.data.active) return;
    const frame = this._session.frames.find(item => item.id === this.data.active.passageId);
    this.setData({ chainFrame: frame });
    if (!this.data.chainBusy && frame?.ready) this._continuation.prefetch(this._session, frame);
  },
  checkChainEnd() {
    if (!this._session?.chainId || this.data.chainBusy || this.data.paused) return;
    // New content joins near the forward edge. A slow response never stops
    // the wheel, nor replaces the neighbouring rows just after a wrap.
    if (this._timeline.index >= this._readingLines.length - 3) {
      if (this._nextBatch) {
        const batch = this._nextBatch; this._nextBatch = null;
        this.replaceChainBatch(batch); this.trimChainWindow(); this.refreshChainLinks();
      } else this.fetchNextChain();
    }
    this.trimChainWindow();
  },
  async fetchNextChain() {
    const chain = this._session;
    if (!chain?.cursor || chain.exhausted || this._nextRequest || this._nextBatch || this.data.chainBusy || this._nextFailedCursor === chain.cursor) return;
    const token = this._chainRequest, marker = {};
    this._nextRequest = marker;
    try {
      const batch = await this._continuation.next({ chainId: chain.chainId, cursor: chain.cursor });
      if (!this.chainCurrent(token) || this._session.chainId !== chain.chainId) return;
      if (this.data.paused || this._timeline.index >= this._readingLines.length - 3) {
        this.replaceChainBatch(batch); this.trimChainWindow(); this.refreshChainLinks();
      } else this._nextBatch = batch;
    } catch (error) {
      if (!error.cancelled && this.chainCurrent(token)) {
        this._nextFailedCursor = chain.cursor;
        this._retryOperation = { type: 'next' };
        this.setData({ chainError: '后续经文还未到来，可以留在这一句，或沿短解展开。' });
      }
    } finally { if (this._nextRequest === marker) this._nextRequest = null; }
  },
  trimChainWindow() {
    if (this._session.frames.length <= 12) return;
    const activeIndex = this._session.frames.findIndex(frame => frame.id === this.data.active.passageId);
    const remove = Math.min(this._session.frames.length - 12, activeIndex - 2);
    if (remove <= 0) return;
    try { this._chainStore.saveWindow(this._session, this.chainSnapshot()); }
    catch (_) { this.setData({ chainError: '本机记录空间不足，先留在这一段。' }); this.setData({ paused: true }); this.syncMotion(); return; }
    const removedLines = readingLines(this._session.frames.slice(0, remove)).length;
    this._session.frames = this._session.frames.slice(remove);
    this._windowStart += removedLines;
    this._timeline.position -= removedLines * CELL;
    this._timeline.rowOffset += removedLines;
    this._readingLines = readingLines(this._session.frames);
    this._timeline.count = this._readingLines.length;
    if (this._renderer) this._renderer.setFrames(this._readingLines);
  },
  async previousChainWindow() {
    const saved = this._chainStore.previousWindow(this._session.chainId, this._session.frames[0].ordinal);
    if (!saved) return;
    const token = ++this._chainRequest;
    this.saveChain();
    // Re-enter the preceding original passage; future batches remain cached by
    // their cursor, so replaying a historical window cannot duplicate nodes.
    const lines = readingLines(saved.chain.frames), first = this._session.frames[0].ordinal;
    const target = lines.findIndex(line => line.ordinal === first - 1);
    saved.snapshot.position = (Math.max(0, target) + CENTER_PHASE) * CELL;
    saved.snapshot.paused = true;
    await this.presentChain(await this._chainFonts.prepare(saved.chain), saved.snapshot, token);
  },
  async returnToChain(event) {
    const id = event?.currentTarget?.dataset?.chain || this._session?.parentChainId;
    if (!id) return;
    const token = ++this._chainRequest;
    this._nextRequest = null;
    this._nextBatch = null;
    try {
      this.saveChain();
      const saved = this._chainStore.get(id);
      if (!saved) throw new Error('未找到这次阅读的位置，当前经文仍在。');
      this._continuation.setVisible(false); this._continuation.setVisible(true);
      this.setData({ chainBusy: true, chainError: '', overlay: '', overlayVisible: false });
      this.syncMotion();
      await this.presentChain(await this._chainFonts.prepare(saved.chain), saved.snapshot, token);
    } catch (error) { this.chainFailure(error, token); }
  },
  openChainPath() {
    if (!this.data.paused) { this._afterReading = 'path'; this.settleReading(); }
    else this.showNoteSheet('path');
  },
  retryChain() {
    this._nextFailedCursor = null;
    this.setData({ chainError: '' });
    if (this._retryOperation?.type === 'open') { this.openChainSession(this._retryOperation.seed); return; }
    if (this._retryOperation?.type === 'branch' && this._session.chainId === this._retryOperation.input.chainId) {
      this.branchFromWord({ detail: { frameId: this._retryOperation.input.fromFrameId, anchorId: this._retryOperation.input.anchorId } }); return;
    }
    if (this._session.frames.some(frame => !frame.ready) && this._lastBranch) {
      const token = ++this._chainRequest;
      this.setData({ chainBusy: true });
      this._continuation.branch(this._lastBranch).then(chain => {
        if (this.chainCurrent(token)) this.replaceChainBatch(chain);
      }).catch(error => this.chainFailure(error, token));
    } else this.fetchNextChain();
  },
  cancelBranch() {
    this._resumeSeed = undefined;
    this._retryOperation = null;
    if (this._session?.frames.some(frame => !frame.ready) && this._session.parentChainId) { this.returnToChain(); return; }
    this._chainRequest++;
    this._continuation.setVisible(false); this._continuation.setVisible(true);
    this.setData({ chainBusy: false, loading: false, chainError: '' });
    this.syncMotion();
  },
};
module.exports = { chainActions };
