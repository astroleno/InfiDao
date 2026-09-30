const { createChainProvider } = require('./chain-provider');
const { createChainStore } = require('./chain-store');
const { createContinuation } = require('./continuation');
const { createChainFonts } = require('./chain-fonts');
const { FlowTimeline, CELL, CENTER_PHASE } = require('./timeline');
const { readingLines, sceneMetrics } = require('./scene');
const { RibbonWindow, SLOT_COUNT } = require('./ribbon-window');
const { createRequestBudget } = require('./request-budget');
const { branchInput, mergeChain } = require('./generated/shared/controller');
const { createNativeController, recordFromNative } = require('./controller-host');

const chainActions = {
  initChains(api) {
    api = createRequestBudget(api);
    this._networkBudget = api;
    this._provider = createChainProvider(api);
    this._chainStore = createChainStore(api, {
      ...(this._provider.kind === 'native' ? { prefix: 'infidao-native-chain-v1:' } : {}),
      allowTemporary: true,
      autoPrune: true,
      onTemporary: error => {
        if (!this._alive) return;
        const reason = error.message === 'CHAIN_STORAGE_FULL' ? '阅读记录已满' : '本机暂时无法保存';
        this.setData({ storageNotice: reason + '，本次阅读进度暂不保存；已有记录和注脚仍保留。' });
        if (api.showToast) api.showToast({ title: '本次阅读进度暂不保存', icon: 'none', duration: 3000 });
      },
    });
    this._chainFonts = this._provider.fonts || createChainFonts(api, this._provider.origin || '');
    this._continuation = createContinuation(this._provider, chain => this._chainFonts.prepare(chain));
    this._chainRequest = 0;
  },
  chainSnapshot() {
    const visible = new Set((this._session?.frames || []).map(frame => frame.id));
    return { position: this._timeline.position, rowOffset: this._timeline.rowOffset,
      ambientPhase: this._timeline.ambientPhase, paused: this.data.paused,
      sourceOpen: this.data.sourceOpen, readingScroll: this._readingScrollTop || 0,
      readingPositions: Object.fromEntries(Object.entries(this._readingPositions || {}).filter(([id]) => visible.has(id))), windowStart: this._windowStart || 0,
      ribbon: this._ribbon?.snapshot() };
  },
  flowController() {
    if (!this._flowController) this._flowController = createNativeController(this);
    return this._flowController;
  },
  saveChain() {
    if (this._flowController) return this._flowController.checkpoint();
    if (!this._session?.chainId) return;
    if (this.data.readingVisible) this.readerPositions()[this.data.sourceOpen ? 'source' : 'reading'] = this._readingScrollTop || 0;
    this._chainStore.put(this._session, this.chainSnapshot());
  },
  async openChainSession(seed) {
    this._spatialTransition = null;
    this._resumeSeed = undefined;
    this.setData({ branchLabel: '', pressedAnchor: '', transitionWord: '', inputFocus: false, overlayVisible: false });
    return this.flowController().open(seed);
  },
  chainCurrent(token) { return this._alive && this._visible && token === this._chainRequest; },
  chainFailure(error, token) {
    if (!this.chainCurrent(token) || error.cancelled) return;
    const message = error.message === 'TEMPORARY_STORAGE_FULL' ? '本次临时阅读空间已满，当前经句仍可阅读。' :
      error.message === 'CHAIN_STORAGE_FULL' ? '本机阅读记录已满，原句仍在。' :
      error.message && !/^[A-Z_]+$/.test(error.message) ? error.message : '这条联系暂未展开，原句仍可阅读。';
    this._spatialTransition = null;
    this.setData({ wordHit: null, chainBusy: false, chainPending: false, loading: false, pressedAnchor: '', transitionWord: '',
      chainErrorAction: error.code === 'CONNECTION_REQUIRED' ? 'connect' : 'retry',
      chainError: this._session ? message : '', error: this._session ? '' : message });
    this._resumeSeed = undefined;
    this.syncMotion();
  },
  async branchFromWord(event) {
    if (this.data.chainBusy || !this._session?.chainId) return;
    const detail = event.detail || {};
    const selected = { frameId: detail.frameId || event.currentTarget?.dataset.frame,
      anchorId: detail.anchorId || event.currentTarget?.dataset.anchor, selection: detail.selection };
    let entry;
    try { entry = branchInput(this._session, selected); }
    catch (error) { this.chainFailure(error, this._chainRequest); return; }
    this._branchPressedAt = Date.now();
    this._spatialTransition = { direction: 1, label: entry.label };
    try { this._networkBudget?.setStorageSync('infidao-word-links-learned-v1', true); } catch (_) {}
    this.setData({ hintVisible: false, pressedAnchor: entry.input.anchorId, branchLabel: entry.label });
    this.pulse();
    return this.flowController().branch(selected);
  },
  async presentChain(chain, snapshot, token) {
    if (!chain.frames.length || !this.chainCurrent(token)) return;
    this.setData({ wordHit: null });
    // Save before replacing anything. Storage exhaustion cannot destroy the
    // only snapshot of the parent or leave a non-returnable branch onscreen.
    if (!this._flowController) this._chainStore.put(chain, snapshot || {});
    if (this._renderer && !this.data.snapshotReady) {
      const action = this.beginAction();
      await new Promise(resolve => { this._resolveChainCapture = resolve; this.captureScene(action, resolve); });
      this._resolveChainCapture = null;
      if (!this.chainCurrent(token)) return;
    }
    this._continuation.cancelUnrelated(chain.chainId);
    if (this._spatialTransition && this.data.shots?.length) {
      this.setData({ shots: this.data.shots.map(shot => ({ ...shot, locked: true, shift: this.data.sceneShift || 0 })) });
    }
    if (this._provider.restore) this._provider.restore(chain);
    this._session = chain;
    this._timeline = new FlowTimeline(SLOT_COUNT);
    this._timeline.loop = true;
    this._windowStart = snapshot?.windowStart || 0;
    if (snapshot) for (const key of ['position', 'rowOffset', 'ambientPhase']) this._timeline[key] = snapshot[key] || 0;
    this._ribbon = new RibbonWindow(readingLines(chain.frames), this.ribbonCursor(), snapshot?.ribbon, this._timeline.rowOffset);
    this._readingLines = this._ribbon.frames(this.ribbonCursor());
    this._timeline.centers = this._readingLines.map(line => line.centerOffset || 0);
    if (!snapshot) this._timeline.position = this._timeline.targetFor(0);
    this._timeline.setVisible(this._visible);
    this._readingPositions = snapshot?.readingPositions || {};
    // The old native scroll-view can emit a reset while its content changes.
    // Keep the saved destination independent of those transient scroll events.
    const readingScroll = snapshot?.readingScroll || 0;
    this._readingScrollTop = readingScroll;
    const paused = !!snapshot?.paused || !!this._reducedMotion || !!chain.fontUnavailable;
    this.setData({ loading: false, chainBusy: !chain.frames[0].ready, chainError: '', overlay: '', inputFocus: false,
      seed: chain.seed, personalSeed: chain.seedOrigin === 'user', paused, phase: 'entering', readingVisible: false,
      sourceOpen: !!snapshot?.sourceOpen, sourceMounted: !!snapshot?.sourceOpen, sourceTarget: '',
      sceneShift: snapshot?.sourceOpen ? this.data.detailShift : 0, keyboardHeight: 0,
      chainId: chain.chainId, chainParent: chain.parentChainId || '', chainLabel: chain.entry?.label || '',
      chainPath: this._chainStore.path(chain.chainId), chainKind: chain.kind,
      total: chain.exhausted ? String(chain.frames[chain.frames.length - 1].ordinal).padStart(2, '0') : '…' });
    this.updateActive(true);
    const finish = () => {
      if (!this.chainCurrent(token)) return;
      this._branchReadableMs = this._branchPressedAt ? Date.now() - this._branchPressedAt : null;
      this._branchPressedAt = null;
      this._spatialTransition = null;
      this.setData({ pressedAnchor: '', transitionWord: '', branchLabel: '' });
      if (paused) {
        this.setData({ phase: 'reading', readingVisible: true }, () => {
          if (this.chainCurrent(token)) this.scrollReader(readingScroll);
        });
      } else {
        const action = this._action;
        this.revealLive(action, () => { this.setData({ phase: 'flow' }); this.syncMotion(); });
      }
      this.refreshChainLinks();
    };
    if (chain.fontUnavailable) { this.graphicsFailed(new Error('Font unavailable')); finish(); return; }
    if (!this._renderer || this.data.graphicsError) { this._spatialTransition = null; this.setData({ graphicsError: false, pressedAnchor: '', transitionWord: '', branchLabel: '' }); this.initRenderer(); return; }
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
    this._session = mergeChain(this._session, batch);
    const metrics = sceneMetrics(this._window?.windowWidth || 390, this.data.sceneHeight || 725);
    const guard = Math.ceil(Math.max((this.data.sceneHeight || 725) / 2 - metrics.radius, metrics.pitch) / metrics.pitch) + 1;
    this._ribbon.update(readingLines(this._session.frames), this.ribbonCursor(), guard);
    this.setData({ chainBusy: false, chainError: '', total: this._session.exhausted ? String(this._session.frames[this._session.frames.length - 1].ordinal).padStart(2, '0') : '…' });
    if (batch.fontUnavailable) { this.graphicsFailed(new Error('Font unavailable')); return; }
    this.syncRibbon(true);
    this.updateActive(true); this.syncMotion();
  },
  ribbonCursor() { return this._timeline.position / CELL - CENTER_PHASE + this._timeline.rowOffset; },
  syncRibbon(force = false) {
    if (!this._ribbon) return;
    const changed = this._ribbon.refresh(this.ribbonCursor());
    if (!changed && !force) return;
    this._readingLines = this._ribbon.frames(this.ribbonCursor());
    this._timeline.centers = this._readingLines.map(line => line.centerOffset || 0);
    if (this._renderer) this._renderer.setFrames(this._readingLines);
  },
  refreshChainLinks() {
    if (!this._session?.chainId || !this.data.active) return;
    const frame = this._session.frames.find(item => item.id === this.data.active.passageId);
    this.setData({ chainFrame: frame });
    if (!this.data.chainBusy && frame?.ready) {
      const priority = this.data.sourceOpen ? ['quote', 'meaning', 'reflection'] : ['meaning', 'reflection', 'quote'];
      const anchors = frame.anchors.filter(anchor => !this._chainStore.child(this._session.chainId, frame.id, anchor.id))
        .sort((a, b) => priority.indexOf(a.surface || 'reflection') - priority.indexOf(b.surface || 'reflection'));
      this._continuation.prefetch(this._session, { ...frame, anchors });
    }
  },
  checkChainEnd() {
    if (!this._session?.chainId || this.data.chainBusy || this.data.paused || this._session.frames.some(frame => frame.ready === false)) return;
    const last = this._session.frames[this._session.frames.length - 1];
    if (this.data.active?.ordinal >= last.ordinal - 1) this.fetchNextChain();
    this.trimChainWindow();
  },
  async fetchNextChain() {
    const chain = this._session;
    if (!chain?.cursor || chain.exhausted || chain.frames.some(frame => frame.ready === false)) return;
    await this.flowController().next();
    if (this._session) { this.trimChainWindow(); this.refreshChainLinks(); }
  },
  trimChainWindow() {
    if (this._session.frames.length <= 12) return;
    const pinned = this._ribbon.usedPassages();
    const remove = this._session.frames.filter((frame, index) => index < this._session.frames.length - 12 &&
      frame.ordinal < this.data.active.ordinal - 2 && !pinned.has(frame.id));
    if (!remove.length) return;
    try { this._chainStore.saveWindow(this._session, this.chainSnapshot()); }
    catch (_) { this.setData({ chainError: '本机记录空间不足，先留在这一段。' }); this.setData({ paused: true }); this.syncMotion(); return; }
    const removedLines = readingLines(remove).length, ids = new Set(remove.map(frame => frame.id));
    this._session.frames = this._session.frames.filter(frame => !ids.has(frame.id));
    this._windowStart += removedLines;
    this._ribbon.update(readingLines(this._session.frames), this.ribbonCursor());
  },
  async previousChainWindow() {
    const saved = this._chainStore.previousWindow(this._session.chainId, this._session.frames[0].ordinal);
    if (!saved) return;
    const controller = this.flowController();
    // Re-enter the preceding original passage; future batches remain cached by
    // their cursor, so replaying a historical window cannot duplicate nodes.
    const lines = readingLines(saved.chain.frames), first = this._session.frames[0].ordinal;
    const target = lines.findIndex(line => line.ordinal === first - 1);
    saved.snapshot.position = (Math.max(0, target) + CENTER_PHASE) * CELL;
    saved.snapshot.ribbon = null;
    saved.snapshot.rowOffset = 0;
    saved.snapshot.paused = true;
    await controller.restore(saved.chain.chainId, { record: recordFromNative(saved), navigation: 'restore' });
  },
  async returnToChain(event) {
    const id = event?.currentTarget?.dataset?.chain || this._session?.parentChainId;
    if (!id) return;
    this._spatialTransition = { direction: -1, label: this._session.entry?.label || '' };
    this.setData({ branchLabel: '', overlay: '', overlayVisible: false });
    return this.flowController().restore(id);
  },
  openChainPath() {
    if (!this.data.paused) { this._afterReading = 'path'; this.settleReading(); }
    else this.showNoteSheet('path');
  },
  retryChain() { return this.flowController().retry(); },
  dismissChainError() {
    this._flowController?.dismissError();
    this.setData({ chainError: '' });
  },
  resumeIncompleteChain() { return this.flowController().resume(); },
  cancelBranch() {
    this._resumeSeed = undefined;
    if (this._session?.frames.some(frame => frame.ready === false) && this._session.parentChainId) return this.returnToChain();
    this.beginAction();
    this._spatialTransition = null;
    this.flowController().cancel();
    this.setData({ wordHit: null, transitionWord: '', pressedAnchor: '', branchLabel: '',
      shots: (this.data.shots || []).map(shot => ({ ...shot, locked: false, offset: 0, scale: 1, departing: false })) });
    this.syncMotion();
  },
};
module.exports = { chainActions };
