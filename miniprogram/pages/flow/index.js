const { validateSession, DEFAULT_SEED } = require('../../flow/provider');
const { FlowTimeline, CELL, CENTER_PHASE, modulo } = require('../../flow/timeline');
const { WheelRenderer } = require('../../flow/renderer');
const { readingLines } = require('../../flow/scene');
const { typography } = require('../../flow/typography');
const { createNoteStore } = require('../../flow/notes');
const { chainActions } = require('../../flow/chain-page');
const { textSpans } = require('../../flow/text-spans');

Page({
  ...chainActions,
  data: {
    ready: false, loading: true, error: '', graphicsError: false,
    paused: false, phase: 'flow', overlay: '', overlayVisible: false,
    seed: DEFAULT_SEED, personalSeed: false, draft: '', active: null, ordinal: '01', total: '08',
    sceneTop: 31, sceneHeight: 725, centerY: 393, bottomInset: 48,
    readerTop: 455, readerHeight: 265, detailShift: 160, sceneShift: 0,
    readingVisible: false, sourceOpen: false, sourceMounted: false, sourceParts: [],
    shots: [], snapshotReady: false, keyboardHeight: 0, inputFocus: false,
    hintVisible: true, readingScroll: 0, sourceTarget: '',
    notes: [], noteDraft: '', noteQuote: '', noteError: '', canUndo: false,
    chainId: '', chainParent: '', chainLabel: '', chainPath: [], chainKind: '', chainFrame: null,
    chainBusy: false, chainError: '', branchLabel: '', pressedAnchor: '', transitionWord: '', meaningParts: [], quoteParts: [],
  },

  onLoad() {
    this._alive = true;
    this._visible = true;
    this._request = 0;
    this._action = 0;
    this._shotId = 0;
    this._timers = new Set();
    this.initChains(wx);
    this._noteStore = createNoteStore(wx);
    this._noteDrafts = {};
    this._readingPositions = {};
    this.refreshNotes();
    try { if (wx.getStorageSync('infidao-hint-learned')) this.setData({ hintVisible: false }); } catch (_) {}
    this._timeline = new FlowTimeline(8);
    this.readWindow();
  },
  async onReady() {
    await typography.prepare(wx);
    if (this._alive) this.loadSession('');
  },

  onShow() {
    this._visible = true;
    if (this._networkBudget) this._networkBudget.resumeRequests();
    if (this._continuation) this._continuation.setVisible(true);
    if (!this._timeline) return;
    if (this._resumeSeed !== undefined) { this.openChainSession(this._resumeSeed); return; }
    if (this._session?.chainId && this._session.frames.some(frame => !frame.ready)) this.setData({ chainError: '这条联系尚未展开完整，可以再试或返回。' });
    this._timeline.setVisible(true);
    if (this._pendingSession) { this.enterSession(this._pendingSession); return; }
    if (!this._renderer || this.data.loading) return;
    this.readMotionPreference();
    this.refreshChainLinks();
    if (this.data.paused) {
      if (!this.data.snapshotReady) this.settleReading();
      else this.setData({ phase: 'reading', readingVisible: !this.data.overlay });
    } else if (this.data.shots.length || this.data.phase !== 'flow') this.resumeFlow();
    else { this._renderer.reading = 0; this.syncMotion(); }
  },
  onHide() {
    try { this.saveChain(); } catch (_) {}
    this._visible = false;
    this._chainRequest++;
    this._nextRequest = null;
    if (this._continuation) this._continuation.setVisible(false);
    if (this._networkBudget) this._networkBudget.abortPending();
    this.setData({ chainBusy: false });
    this._spatialTransition = null;
    this.setData({ pressedAnchor: '', transitionWord: '' });
    const interruptedCapture = !!this._pendingShot || this.data.phase === 'entering';
    this.beginAction();
    if (interruptedCapture) this.setData({ shots: [], snapshotReady: false });
    this._touch = null;
    this._timeline.dragging = false;
    this._timeline.setVisible(false);
    if (this._renderer) this._renderer.stop();
    if (this.data.overlay && !this.data.overlayVisible) this.setData({ overlay: '', keyboardHeight: 0 });
    if (!this.data.sourceOpen) this.setData({ sourceMounted: false });
    this.setData({ inputFocus: false });
  },
  onUnload() {
    this._alive = false;
    this._request++;
    this.beginAction();
    if (this._continuation) this._continuation.dispose();
    if (this._networkBudget) this._networkBudget.abortPending();
    if (this._renderer) this._renderer.destroy();
  },

  // Captures, animation completions and keyboard timers belong to one action.
  // A new gesture or lifecycle event invalidates every older completion.
  beginAction() {
    if (this._resolveChainCapture) { this._resolveChainCapture(); this._resolveChainCapture = null; }
    this._action++;
    this._timers.forEach(clearTimeout);
    this._timers.clear();
    this._pendingShot = null;
    return this._action;
  },
  current(action) { return this._alive && this._action === action; },
  later(action, delay, callback) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this.current(action)) callback();
    }, delay);
    this._timers.add(timer);
  },
  onResize() {
    if (this.data.overlay) return;
    this.readWindow();
    if (this.data.loading) return;
    if (this._session && !this.data.graphicsError) this.initRenderer();
  },
  readWindow() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._window = info;
    const bottomInset = Math.max(18, info.safeArea ? info.screenHeight - info.safeArea.bottom + 14 : 30);
    const strip = Math.max(64, bottomInset + 40);
    const sceneTop = Math.round(strip * 0.35);
    const sceneHeight = info.windowHeight - strip - sceneTop;
    const centerY = sceneTop + sceneHeight / 2;
    const readerTop = centerY + (info.windowHeight < 650 ? 38 : 48);
    const readerHeight = Math.max(60, info.windowHeight - bottomInset - 65 - readerTop);
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const safeTop = menu && menu.bottom ? menu.bottom : (info.statusBarHeight || 24) + 44;
    const detailShift = Math.min(160, Math.max(0, centerY - safeTop - 60));
    this.setData({ bottomInset, sceneTop, sceneHeight, centerY, readerTop, readerHeight, detailShift,
      sceneShift: this.data.sourceOpen ? detailShift : 0 });
  },

  async loadSession(seed) {
    if (this._provider.branch) return this.openChainSession(seed);
    const request = ++this._request;
    this._pendingSession = null;
    const action = this.beginAction();
    const departing = !!this.data.overlay;
    this.setData({ loading: true, error: '', inputFocus: false, overlayVisible: false, readingVisible: false });
    this.syncMotion();
    try {
      const session = validateSession(await this._provider.open(seed));
      if (!this._alive || request !== this._request) return;
      this._pendingSession = { request, session };
      if (!this._visible) return;
      const enter = () => this.enterSession({ request, session });
      if (departing && this.current(action)) this.later(action, 240, enter); else enter();
    } catch (error) {
      if (!this._alive || request !== this._request) return;
      this.setData({ loading: false, error: '这一次还没展开，轻点重试。', overlay: '', keyboardHeight: 0 });
      this.syncMotion();
    }
  },

  enterSession(pending) {
    if (!this._alive || pending.request !== this._request) return;
    this._pendingSession = null;
    const session = pending.session;
    this._session = session;
    this._readingPositions = {};
    this._readingLines = readingLines(session.frames);
    this._timeline = new FlowTimeline(this._readingLines.length);
    this._timeline.setVisible(this._visible);
    this.setData({ seed: session.seed, personalSeed: session.seedOrigin === 'user', overlay: '', paused: false, keyboardHeight: 0,
      sourceOpen: false, sourceMounted: false, sceneShift: 0, loading: false, phase: 'entering',
      total: String(session.frames.length).padStart(2, '0') });
    this.updateActive(true);
    if (this.data.graphicsError) this.setData({ ready: true, paused: true, phase: 'reading', readingVisible: true });
    else this.initRenderer();
  },

  initRenderer() {
    if (!this._alive || !this._session) return;
    const action = this.beginAction();
    if (this._renderer) this._renderer.destroy();
    this._renderer = null;
    this.createSelectorQuery()
      .select('#ribbon').fields({ node: true, size: true })
      .select('#glyph-atlas').fields({ node: true, size: true })
      .select('#motion-preference').fields({ computedStyle: ['opacity'] })
      .exec(results => {
        if (!this.current(action)) return;
        try {
          if (!results[0] || !results[0].node || !results[1] || !results[1].node) throw new Error('Canvas unavailable');
          this._reducedMotion = !!results[2] && Number(results[2].opacity) === 0;
          if (this._reducedMotion && !this._motionOptIn) this.setData({ paused: true });
          this._renderer = new WheelRenderer(results[0].node, results[1].node, {
            timeline: this._timeline, width: this._window.windowWidth, height: this.data.sceneHeight,
            reducedMotion: !results[2] || Number(results[2].opacity) !== 1,
            dpr: this._window.pixelRatio, onFrame: () => this.onWheelFrame(), onError: error => this.graphicsFailed(error),
          });
          this._renderer.reading = this.data.paused ? 1 : 0;
          this._renderer.setFrames(this._readingLines);
          this._graphicsFailure = null;
          this.setData({ ready: true, graphicsError: false });
          if (this.data.paused) this.settleReading();
          else if (this.data.snapshotReady) {
            this.captureScene(action, () => this.revealLive(action, () => {
              this.setData({ phase: 'flow' }); this.syncMotion();
            }));
          } else { this.setData({ phase: 'flow' }); this.syncMotion(); }
        } catch (error) { this.graphicsFailed(error); }
      });
  },

  readMotionPreference() {
    const renderer = this._renderer;
    if (!renderer || !this.createSelectorQuery) return;
    this.createSelectorQuery().select('#motion-preference').fields({ computedStyle: ['opacity'] }).exec(results => {
      if (!this._alive || renderer !== this._renderer) return;
      renderer.reducedMotion = !results[0] || Number(results[0].opacity) !== 1;
      const reduced = results[0] && Number(results[0].opacity) === 0;
      if (reduced !== this._reducedMotion) this._motionOptIn = false;
      this._reducedMotion = reduced;
      if (reduced && !this._motionOptIn && this.data.ready && !this.data.paused && !this.data.loading) this.settleReading();
    });
  },

  graphicsFailed(error) {
    if (!this._alive) return;
    this.beginAction();
    this._graphicsFailure = error.message || (error.detail && error.detail.errMsg) || String(error);
    if (this._renderer) this._renderer.destroy();
    this._renderer = null;
    this._afterReading = null;
    this.setData({ ready: true, loading: false, graphicsError: true, paused: true, phase: 'reading',
      shots: [], snapshotReady: false, overlay: '', readingVisible: true, sceneShift: 0,
      sourceOpen: false, sourceMounted: false, inputFocus: false });
    this.updateActive(true);
  },
  syncMotion() {
    if (!this._timeline) return;
    this._timeline.paused = this.data.paused || this.data.phase !== 'flow' || !!this.data.overlay ||
      this.data.loading || this.data.chainBusy || this.data.graphicsError || !!this.data.error;
    if (!this._renderer) return;
    const gliding = this._timeline.flinging && !this.data.overlay && !this.data.loading && !this.data.snapshotReady;
    if (this._visible && (!this._timeline.paused || gliding) && !this._timeline.dragging) this._renderer.start();
    else this._renderer.stop();
  },
  onWheelFrame() {
    this.syncRibbon();
    this.updateActive();
    this.checkChainEnd();
    if (!this._timeline.needsSettle) return;
    this._timeline.needsSettle = false;
    if (this.data.paused) this.settleReading();
    else { this.setData({ phase: 'flow' }); this._timeline.paused = false; }
  },
  updateActive(force) {
    if (!this._readingLines) return;
    const active = this._readingLines[this._timeline.index];
    if (!force && this.data.active && this.data.active.id === active.id) return;
    // Excerpt punctuation can end a sentence where the source continues it.
    const quote = active.passageQuote.replace(/[，。！？；]$/, '');
    const at = active.fullText.indexOf(quote);
    const sourceParts = at < 0 ? [{ text: active.fullText, selected: false }] : [
      { text: active.fullText.slice(0, at), selected: false },
      { text: quote, selected: true },
      { text: active.fullText.slice(at + quote.length), selected: false },
    ].filter(part => part.text);
    const frame = this._session.chainId && this._session.frames.find(item => item.id === active.passageId);
    this.setData({ active, ordinal: String(active.ordinal).padStart(2, '0'), sourceParts: frame ? textSpans(frame, 'fullText') : sourceParts,
      meaningParts: frame ? textSpans(frame, 'meaning') : [{ text: active.meaning }],
      quoteParts: frame ? textSpans(frame, 'quote') : [{ text: active.passageQuote }] });
    this.refreshChainLinks();
  },

  settleReading(index) {
    if (!this._renderer) return;
    const action = this.beginAction();
    this._timeline.cancelFling();
    this.setData({ paused: true, phase: 'settling', readingVisible: false, hintVisible: false });
    this.syncMotion();
    const complete = () => {
      if (!this.current(action)) return;
      this.updateActive(true);
      this.captureScene(action, () => {
        this.setData({ phase: 'reading', readingVisible: !this.data.overlay, readingScroll: 0 });
        this._readingScrollTop = 0;
        try { wx.setStorageSync('infidao-hint-learned', true); } catch (_) {}
        if (this._pulseOnSettle) { this.pulse(); this._pulseOnSettle = false; }
        const next = this._afterReading;
        this._afterReading = null;
        if (next === 'source') this.openSource();
        if (next === 'seed') this.openSeed();
        if (next === 'path') this.showNoteSheet('path');
      });
    };
    if (Number.isInteger(index)) this._renderer.animateTo({ position: this._timeline.targetFor(index), reading: 1, duration: 420 }, complete);
    else this._renderer.center(complete);
  },
  captureScene(action, complete) {
    if (!this.current(action) || !this._renderer || !this._visible) return;
    const token = ++this._shotId;
    this._pendingShot = { action, token, complete };
    wx.canvasToTempFilePath({
      canvas: this._renderer.canvas, fileType: 'png',
      success: result => {
        if (!this.current(action)) return;
        const previous = this.data.snapshotReady ? this.data.shots.slice(-1) : [];
        const spatial = previous.length && this._spatialTransition;
        const direction = spatial && !this._reducedMotion ? spatial.direction : 0;
        this.setData({ shots: previous.concat({ src: result.tempFilePath, token, visible: false, blend: previous.length > 0,
          offset: direction * 28, spatial: !!spatial }) });
      },
      fail: error => { if (this.current(action)) this.graphicsFailed(error); },
    }, this);
    this.later(action, 2500, () => {
      if (this._pendingShot && this._pendingShot.token === token) this.graphicsFailed(new Error('Reading frame unavailable'));
    });
  },
  onSnapshotLoad(event) {
    const pending = this._pendingShot;
    if (!pending || Number(event.currentTarget.dataset.token) !== pending.token || !this.current(pending.action)) return;
    const spatial = this.data.shots.length > 1 && this._spatialTransition;
    const direction = spatial && !this._reducedMotion ? spatial.direction : 0;
    const shots = this.data.shots.map((shot, index, all) => ({ ...shot, visible: true,
      departing: !!spatial && index < all.length - 1, scale: direction && index < all.length - 1 ? 0.985 : 1,
      offset: spatial && index < all.length - 1 ? -direction * 28 : 0 }));
    this._pendingShot = null;
    this.setData({ shots, snapshotReady: true, transitionWord: spatial ? spatial.label : '', transitionReturning: !!spatial && spatial.direction < 0 }, () => {
      const finish = () => {
        if (!this.current(pending.action)) return;
        this.setData({ shots: shots.slice(-1) });
        pending.complete();
      };
      if (shots.length > 1) this.later(pending.action, this._reducedMotion ? 0 : spatial ? 340 : 260, finish); else wx.nextTick(finish);
    });
  },
  onSnapshotError(event) {
    if (this._pendingShot && Number(event.currentTarget.dataset.token) === this._pendingShot.token) {
      this.graphicsFailed(new Error('Reading image unavailable'));
    }
  },
  revealLive(action, complete) {
    if (!this.current(action) || !this._renderer) return;
    try { this._renderer.draw(); } catch (error) { this.graphicsFailed(error); return; }
    this.setData({ snapshotReady: false }, () => wx.nextTick(() => {
      if (!this.current(action)) return;
      this.setData({ shots: [] });
      complete();
    }));
  },
  resumeFlow() {
    this._motionOptIn = true;
    const action = this.beginAction();
    this._afterReading = null;
    this._pulseOnSettle = false;
    this._timeline.cancelFling();
    const delay = Math.max(this.data.sourceOpen ? 340 : this.data.readingVisible ? 220 : 0,
      (this._sceneResetAt || 0) - Date.now());
    this.setData({ paused: false, readingVisible: false, sourceOpen: false, sourceTarget: '', sceneShift: 0, phase: 'resuming' });
    this.syncMotion();
    this.later(action, delay, () => {
      this.setData({ sourceMounted: false });
      if (this.data.graphicsError) {
        if (this._session?.chainId) {
          this.setData({ paused: true, phase: 'reading', readingVisible: true });
          this._chainFonts.prepare(this._session).then(prepared => {
            if (!this.current(action)) return;
            if (prepared.fontUnavailable) { this.setData({ chainError: '字形还未准备好，可以先读原文，稍后恢复流动。' }); return; }
            this._session = prepared;
            this.setData({ graphicsError: false, ready: false, paused: false, readingVisible: false, chainError: '' });
            this.initRenderer();
          });
          return;
        }
        this.setData({ graphicsError: false, ready: false });
        this.initRenderer();
        return;
      }
      this.revealLive(action, () => this._renderer.restore(() => {
        if (!this.current(action)) return;
        this.setData({ phase: 'flow' });
        this.syncMotion();
      }));
    });
  },
  togglePause() {
    if (this.data.paused) this.resumeFlow();
    else { this._pulseOnSettle = true; this.settleReading(); }
  },
  onPauseControl() { if (this.data.ready && !this.data.loading && !this.data.chainBusy) this.resumeFlow(); },

  onTouchStart(event) {
    if (!this._renderer || this.data.overlay || this.data.loading || this.data.chainBusy || this.data.sourceOpen) return;
    const touch = event.touches[0];
    if (!touch) return;
    this.beginAction();
    this._afterReading = null;
    this._suppressTap = false;
    this._handledTouchTapUntil = 0;
    this._timeline.cancelFling();
    this._timeline.dragging = true;
    this._touch = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastT: event.timeStamp,
      moved: false, reading: this._renderer.reading };
    // A finger landing is not yet a drag. Keep the same reading image and copy
    // visible until movement establishes intent.
    this._renderer.stop();
  },
  onTouchMove(event) {
    if (!this._touch || !this._renderer) return;
    const touch = event.touches[0];
    if (!touch) return;
    const distance = Math.hypot(touch.clientX - this._touch.x, touch.clientY - this._touch.y);
    if (distance > 7 && !this._touch.moved) {
      this._touch.moved = true;
      // Keep the image node mounted until touchend so native events survive.
      this.setData({ readingVisible: false, snapshotReady: false, phase: 'dragging' });
    }
    if (this._touch.moved) {
      this._renderer.reading = this._touch.reading * Math.max(0, 1 - distance / 45);
      this._timeline.scrub(touch.clientY - this._touch.lastY, this._renderer.scrollPitch, (event.timeStamp - this._touch.lastT) / 1000);
      this.syncRibbon();
      try { this._renderer.draw(); } catch (error) { this.graphicsFailed(error); return; }
      this.updateActive();
    }
    this._touch.lastY = touch.clientY;
    this._touch.lastT = event.timeStamp;
  },
  onTouchEnd() {
    if (!this._touch) return;
    this._suppressTap = this._touch.moved;
    this._suppressTapUntil = this._suppressTap ? Date.now() + 250 : 0;
    const touch = this._touch;
    this._touch = null;
    const flung = this._timeline.release();
    this._timeline.dragging = false;
    if (!this._suppressTap) {
      // Native WebGL canvases can emit touchend without a synthetic tap.
      // Handle it here and ignore the duplicate tap emitted by image surfaces.
      this._handledTouchTapUntil = Date.now() + 350;
      this.selectAt(touch.x, touch.y);
      return;
    }
    if (this.data.paused && !flung) this.settleReading();
    else { this.setData({ phase: flung ? 'gliding' : 'flow' }); this.syncMotion(); }
  },
  selectAt(x, y) {
    const hit = Number.isFinite(x) && this._renderer.hitTest ? this._renderer.hitTest(x, y - this.data.sceneTop + this.data.sceneShift) : null;
    if (hit && !this.data.paused) {
      this._pulseOnSettle = true;
      this.settleReading(hit.index);
    } else this.togglePause();
  },
  onCanvasTap(event) {
    if (this.data.chainBusy) return;
    if (Date.now() < (this._handledTouchTapUntil || 0)) { this._handledTouchTapUntil = 0; return; }
    if (this._suppressTap && Date.now() < this._suppressTapUntil) { this._suppressTap = false; return; }
    this._suppressTap = false;
    if (this.data.sourceOpen) { this.closeSource(); return; }
    if (this._renderer && !this.data.loading && !this.data.overlay) {
      const point = event && event.detail || {};
      this.selectAt(point.x, point.y);
    }
  },
  onTouchCancel() {
    const moved = this._touch && this._touch.moved;
    this._touch = null;
    this._timeline.cancelFling();
    this._timeline.dragging = false;
    if (this.data.paused && !moved && this.data.snapshotReady) this.syncMotion();
    else if (this.data.paused) this.settleReading();
    else { this.setData({ phase: 'flow' }); this.syncMotion(); }
  },

  openSource() {
    if (!this.data.active || this.data.loading || this.data.chainBusy) return;
    if (this.data.sourceOpen) { this.closeSource(); return; }
    if (!this.data.snapshotReady && !this.data.graphicsError) {
      this._afterReading = 'source';
      if (this.data.phase !== 'settling') this.settleReading();
      return;
    }
    const action = this.beginAction();
    const positions = this.readerPositions();
    positions.reading = this._readingScrollTop || 0;
    this.setData({ sourceMounted: true, sourceOpen: true, sceneShift: this.data.detailShift }, () => {
      wx.nextTick(() => {
        if (this.current(action)) this.scrollReader(positions.source || 0, positions.source === undefined ? 'source-heading' : '');
      });
    });
    this.refreshChainLinks();
  },
  closeSource() {
    const action = this.beginAction();
    this._sceneResetAt = Date.now() + 340;
    this.readerPositions().source = this._readingScrollTop || 0;
    this.setData({ sourceOpen: false, sourceTarget: '', sceneShift: 0 });
    this.refreshChainLinks();
    this.scrollReader(this.readerPositions().reading || 0);
    this.later(action, 340, () => this.setData({ sourceMounted: false }));
  },
  openSeed() {
    if (this.data.loading || this.data.chainBusy) return;
    if (!this.data.snapshotReady && !this.data.graphicsError) {
      this._afterReading = 'seed';
      if (this.data.phase !== 'settling') this.settleReading();
      return;
    }
    const action = this.beginAction();
    this.setData({ overlay: 'seed', overlayVisible: false, readingVisible: false, draft: this.data.personalSeed ? this.data.seed : '', inputFocus: false, keyboardHeight: 0 }, () => {
      wx.nextTick(() => {
        if (!this.current(action)) return;
        this.setData({ overlayVisible: true });
        this.later(action, 320, () => this.setData({ inputFocus: true }));
      });
    });
    this.syncMotion();
  },
  closeOverlay() {
    if (!this.data.overlay || this.data.loading) return;
    const action = this.beginAction();
    this.setData({ overlayVisible: false, inputFocus: false });
    wx.hideKeyboard();
    this.later(action, 240, () => {
      this.setData({ overlay: '', keyboardHeight: 0, readingVisible: true });
      this.syncMotion();
    });
  },
  onSeedInput(event) { this.setData({ draft: event.detail.value }); },
  onKeyboardHeight(event) { if (this.data.overlayVisible) this.setData({ keyboardHeight: event.detail.height || 0 }); },
  submitSeed() {
    const seed = this.data.draft.trim();
    if (!seed || this.data.loading) return;
    wx.hideKeyboard(); this.loadSession(seed);
  },
  usePrompt(event) { wx.hideKeyboard(); this.loadSession(event.currentTarget.dataset.seed); },

  changePassage(direction) {
    if (!this._session || this.data.loading) return;
    let ordinal = modulo(this.data.active.ordinal - 1 + direction, this._session.frames.length);
    if (this._session.chainId) {
      const current = this._session.frames.findIndex(frame => frame.id === this.data.active.passageId);
      if (current + direction < 0 && this._windowStart > 0) { this.previousChainWindow(); return; }
      if (current + direction >= this._session.frames.length && !this._session.exhausted) this.fetchNextChain();
      ordinal = modulo(current + direction, this._session.frames.length);
    }
    const passageId = this._session.frames[ordinal].id;
    const candidates = this._readingLines.map((line, index) => ({ line, index }))
      .filter(item => item.line.passageId === passageId && item.line.lineIndex === 0);
    const period = this._readingLines.length * CELL;
    const travel = index => Math.abs(modulo(this._timeline.targetFor(index) - this._timeline.position + period / 2, period) - period / 2);
    // A fixed display window can contain several occurrences of one passage.
    // Choose the nearby occurrence instead of flying to the first GPU slot.
    candidates.sort((a, b) => travel(a.index) - travel(b.index));
    let index = candidates.length ? candidates[0].index : -1;
    if (index < 0 && this._ribbon) {
      this._ribbon.seek(passageId, this.ribbonCursor()); this.syncRibbon(true);
      index = this._timeline.index;
    }
    const action = this.beginAction();
    const delay = this.data.sourceOpen ? 340 : 180;
    this.setData({ sourceOpen: false, sceneShift: 0, readingVisible: false, phase: 'settling' });
    this.later(action, delay, () => {
      this.setData({ sourceMounted: false, readingScroll: 0 });
      const target = this._timeline.targetFor(index);
      if (this.data.graphicsError) {
        const period = this._readingLines.length * CELL;
        this._timeline.advancePosition(modulo(target - this._timeline.position + period / 2, period) - period / 2);
        this.updateActive(true);
        this.setData({ phase: 'reading', readingVisible: true });
        return;
      }
      this.revealLive(action, () => this._renderer.animateTo({ position: target, reading: 1, duration: 420 }, () => {
        if (!this.current(action)) return;
        this.updateActive(true);
        this.captureScene(action, () => this.setData({ phase: 'reading', readingVisible: true }));
      }));
    });
  },
  previous() { this.changePassage(-1); },
  next() { this.changePassage(1); },
  readerPositions() {
    const id = this.data.active.passageId;
    return this._readingPositions[id] || (this._readingPositions[id] = { reading: 0 });
  },
  onReadingScroll(event) { this._readingScrollTop = event.detail.scrollTop; },
  scrollReader(top, anchor = '') {
    const action = this._action;
    this.setData({ sourceTarget: '', readingScroll: top + 1 }, () => {
      this.setData({ readingScroll: top });
      // Native scrollTop can overwrite scroll-into-view when both arrive in
      // the same layout. Let the mounted section and scroll reset commit first.
      if (anchor) this.later(action, 48, () => this.setData({ sourceTarget: anchor }));
    });
    this._readingScrollTop = top;
  },
  resetReadingScroll() {
    this.scrollReader(0);
  },
  refreshNotes() {
    try {
      const notes = this._noteStore.list().map(note => {
        const date = new Date(note.createdAt);
        return { ...note, dateLabel: [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('.') };
      });
      this.setData({ notes, noteError: '' });
    }
    catch (_) { this.setData({ noteError: '暂时无法读取本机注脚，请稍后再试。' }); }
  },
  showNoteSheet(overlay) {
    const action = this.beginAction();
    this.setData({ overlay, overlayVisible: false, readingVisible: false, inputFocus: false, keyboardHeight: 0 }, () => {
      wx.nextTick(() => {
        if (!this.current(action)) return;
        this.setData({ overlayVisible: true });
        if (overlay === 'note') this.later(action, 320, () => this.setData({ inputFocus: true }));
      });
    });
    this.syncMotion();
  },
  openNote() {
    const active = this.data.active;
    if (!active || !this.data.paused || this.data.chainBusy) return;
    this._noteContext = { passageId: active.passageId, sourceId: active.sourceId, quote: active.passageQuote,
      source: active.source, chapterLabel: active.chapterLabel, seed: this.data.personalSeed ? this.data.seed : '' };
    this.setData({ noteQuote: active.passageQuote, noteDraft: this._noteDrafts[active.passageId] || '', noteError: '' });
    this.showNoteSheet('note');
  },
  onNoteInput(event) {
    this.setData({ noteDraft: event.detail.value, noteError: '' });
    this._noteDrafts[this._noteContext.passageId] = event.detail.value;
  },
  saveNote() {
    if (!this.data.noteDraft.trim()) return;
    try {
      const notes = this._noteStore.add(this._noteContext, this.data.noteDraft);
      delete this._noteDrafts[this._noteContext.passageId];
      this.setData({ notes, noteDraft: '', noteError: '' });
      this.pulse(); this.closeOverlay();
    } catch (error) {
      this.setData({ noteError: error.message === 'Notes full' ? '本机已留下 100 条注脚，整理后可以继续留句。' : '这句还没有保存，文字已保留，请再试一次。' });
    }
  },
  openNotes() { this.refreshNotes(); this.showNoteSheet('notes'); },
  removeNote(event) {
    try {
      this._removedNote = this._noteStore.remove(event.currentTarget.dataset.id);
      this.refreshNotes(); this.setData({ canUndo: !!this._removedNote });
    } catch (_) { this.setData({ noteError: '未能删除，这条注脚仍保留在本机。' }); }
  },
  undoRemove() {
    try {
      this._noteStore.restore(this._removedNote);
      this._removedNote = null;
      this.refreshNotes(); this.setData({ canUndo: false });
    } catch (_) { this.setData({ noteError: '暂时未能恢复，请再试一次。' }); }
  },
  retry() { this.loadSession(this.data.personalSeed ? this.data.seed : ''); },
  swallow() {},
  pulse() { if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail() {} }); },
  getFlowState() {
    return { index: this._timeline.index, position: this._timeline.position,
      running: !!this._renderer && this._renderer.running, visible: this._visible,
      paused: this.data.paused, phase: this.data.phase, snapshotReady: this.data.snapshotReady,
      mode: this.data.graphicsError ? 'static' : 'webgl', journey: this._session && this._session.journey,
      chainId: this._session?.chainId, parent: this._session?.parentChainId, chainKind: this._provider?.kind,
      chainFrames: this._session?.frames.length, branchReadableMs: this._branchReadableMs,
      chainCache: this._chainStore?.stats(), requests: this._continuation?.stats(),
      fonts: this._chainFonts?.stats(), looping: this._timeline.loop,
      glyphMode: this._renderer ? this._renderer.glyphMode : null,
      graphicsError: this.data.graphicsError, graphicsFailure: this._graphicsFailure || null,
      glError: this._renderer ? this._renderer.gl.getError() : null };
  },
});
