const { createMockProvider, validateSession, DEFAULT_SEED } = require('../../flow/provider');
const { FlowTimeline, CELL, modulo } = require('../../flow/timeline');
const { WheelRenderer } = require('../../flow/renderer');
const { readingLines } = require('../../flow/scene');
const { typography } = require('../../flow/typography');

Page({
  data: {
    ready: false, loading: true, error: '', graphicsError: false,
    paused: false, phase: 'flow', overlay: '', overlayVisible: false,
    seed: DEFAULT_SEED, draft: '', active: null, ordinal: '01', total: '08',
    sceneTop: 31, sceneHeight: 725, centerY: 393, bottomInset: 48,
    readerTop: 455, readerHeight: 265, detailShift: 160, sceneShift: 0,
    readingVisible: false, sourceOpen: false, sourceMounted: false, sourceParts: [],
    shots: [], snapshotReady: false, keyboardHeight: 0, inputFocus: false,
    hintVisible: true, readingScroll: 0,
  },

  onLoad() {
    this._alive = true;
    this._visible = true;
    this._request = 0;
    this._action = 0;
    this._shotId = 0;
    this._timers = new Set();
    this._provider = createMockProvider();
    this._timeline = new FlowTimeline(8);
    this.readWindow();
  },
  async onReady() {
    await typography.prepare(wx);
    if (this._alive) this.loadSession(DEFAULT_SEED);
  },

  onShow() {
    this._visible = true;
    if (!this._timeline) return;
    this._timeline.setVisible(true);
    if (this._pendingSession) { this.enterSession(this._pendingSession); return; }
    if (!this._renderer || this.data.loading) return;
    this.readMotionPreference();
    if (this.data.paused) {
      if (!this.data.snapshotReady) this.settleReading();
      else this.setData({ phase: 'reading', readingVisible: !this.data.overlay });
    } else if (this.data.shots.length || this.data.phase !== 'flow') this.resumeFlow();
    else { this._renderer.reading = 0; this.syncMotion(); }
  },
  onHide() {
    this._visible = false;
    this.beginAction();
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
    clearTimeout(this._hintTimer);
    if (this._renderer) this._renderer.destroy();
  },

  // Captures, animation completions and keyboard timers belong to one action.
  // A new gesture or lifecycle event invalidates every older completion.
  beginAction() {
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
    if (this.data.overlay === 'seed') return;
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
    const readerTop = centerY + (info.windowHeight < 650 ? 45 : 62);
    const readerHeight = Math.max(130, info.windowHeight - bottomInset - 65 - readerTop);
    const detailShift = Math.min(160, Math.max(80, centerY - (info.statusBarHeight || 24) - 120));
    this.setData({ bottomInset, sceneTop, sceneHeight, centerY, readerTop, readerHeight, detailShift,
      sceneShift: this.data.sourceOpen ? detailShift : 0 });
  },

  async loadSession(seed) {
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
    this._readingLines = readingLines(session.frames);
    this._timeline = new FlowTimeline(this._readingLines.length);
    this._timeline.setVisible(this._visible);
    this.setData({ seed: session.seed, overlay: '', paused: false, keyboardHeight: 0,
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
          clearTimeout(this._hintTimer);
          this._hintTimer = setTimeout(() => {
            if (this._alive) this.setData({ hintVisible: false });
          }, 9000);
        } catch (error) { this.graphicsFailed(error); }
      });
  },

  readMotionPreference() {
    const renderer = this._renderer;
    if (!renderer || !this.createSelectorQuery) return;
    this.createSelectorQuery().select('#motion-preference').fields({ computedStyle: ['opacity'] }).exec(results => {
      if (this._alive && renderer === this._renderer) renderer.reducedMotion = !results[0] || Number(results[0].opacity) !== 1;
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
      this.data.loading || this.data.graphicsError || !!this.data.error;
    if (!this._renderer) return;
    const gliding = this._timeline.flinging && !this.data.overlay && !this.data.loading && !this.data.snapshotReady;
    if (this._visible && (!this._timeline.paused || gliding) && !this._timeline.dragging) this._renderer.start();
    else this._renderer.stop();
  },
  onWheelFrame() {
    this.updateActive();
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
    this.setData({ active, ordinal: String(active.ordinal).padStart(2, '0'), sourceParts });
  },

  settleReading() {
    if (!this._renderer) return;
    const action = this.beginAction();
    this._timeline.cancelFling();
    this.setData({ paused: true, phase: 'settling', readingVisible: false, hintVisible: false });
    this.syncMotion();
    this._renderer.center(() => {
      if (!this.current(action)) return;
      this.updateActive(true);
      this.captureScene(action, () => {
        this.setData({ phase: 'reading', readingVisible: !this.data.overlay, readingScroll: 0 });
        if (this._pulseOnSettle) { this.pulse(); this._pulseOnSettle = false; }
        const next = this._afterReading;
        this._afterReading = null;
        if (next === 'source') this.openSource();
        if (next === 'seed') this.openSeed();
      });
    });
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
        this.setData({ shots: previous.concat({ src: result.tempFilePath, token, visible: false, blend: previous.length > 0 }) });
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
    const shots = this.data.shots.map(shot => ({ ...shot, visible: true }));
    this._pendingShot = null;
    this.setData({ shots, snapshotReady: true }, () => {
      const finish = () => {
        if (!this.current(pending.action)) return;
        this.setData({ shots: shots.slice(-1) });
        pending.complete();
      };
      if (shots.length > 1) this.later(pending.action, 260, finish); else wx.nextTick(finish);
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
    const action = this.beginAction();
    this._afterReading = null;
    this._pulseOnSettle = false;
    this._timeline.cancelFling();
    const delay = Math.max(this.data.sourceOpen ? 340 : this.data.readingVisible ? 220 : 0,
      (this._sceneResetAt || 0) - Date.now());
    this.setData({ paused: false, readingVisible: false, sourceOpen: false, sceneShift: 0, phase: 'resuming' });
    this.syncMotion();
    this.later(action, delay, () => {
      this.setData({ sourceMounted: false });
      if (this.data.graphicsError) {
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
  onPauseControl() { if (this.data.ready && !this.data.loading) this.resumeFlow(); },

  onTouchStart(event) {
    if (!this._renderer || this.data.overlay || this.data.loading || this.data.sourceOpen) return;
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
    // Keep the touched image mounted until touchend; removing its DOM node can
    // lose the rest of the native touch sequence.
    this.setData({ readingVisible: false, snapshotReady: false, phase: 'dragging' });
    this.syncMotion();
    try { this._renderer.draw(); } catch (error) { this.graphicsFailed(error); }
  },
  onTouchMove(event) {
    if (!this._touch || !this._renderer) return;
    const touch = event.touches[0];
    if (!touch) return;
    const distance = Math.hypot(touch.clientX - this._touch.x, touch.clientY - this._touch.y);
    if (distance > 7) this._touch.moved = true;
    if (this._touch.moved) {
      this._renderer.reading = this._touch.reading * Math.max(0, 1 - distance / 45);
      this._timeline.scrub(touch.clientY - this._touch.lastY, this._renderer.scrollPitch, (event.timeStamp - this._touch.lastT) / 1000);
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
    this._touch = null;
    const flung = this._timeline.release();
    this._timeline.dragging = false;
    if (!this._suppressTap) {
      // Native WebGL canvases can emit touchend without a synthetic tap.
      // Handle it here and ignore the duplicate tap emitted by image surfaces.
      this._handledTouchTapUntil = Date.now() + 350;
      this.togglePause();
      return;
    }
    if (this.data.paused && !flung) this.settleReading();
    else { this.setData({ phase: flung ? 'gliding' : 'flow' }); this.syncMotion(); }
  },
  onCanvasTap() {
    if (Date.now() < (this._handledTouchTapUntil || 0)) { this._handledTouchTapUntil = 0; return; }
    if (this._suppressTap && Date.now() < this._suppressTapUntil) { this._suppressTap = false; return; }
    this._suppressTap = false;
    if (this.data.sourceOpen) { this.closeSource(); return; }
    if (this._renderer && !this.data.loading && !this.data.overlay) this.togglePause();
  },
  onTouchCancel() {
    this._touch = null;
    this._timeline.cancelFling();
    this._timeline.dragging = false;
    if (this.data.paused) this.settleReading();
    else { this.setData({ phase: 'flow' }); this.syncMotion(); }
  },

  openSource() {
    if (!this.data.active || this.data.loading) return;
    if (this.data.sourceOpen) { this.closeSource(); return; }
    if (!this.data.snapshotReady && !this.data.graphicsError) {
      this._afterReading = 'source';
      if (this.data.phase !== 'settling') this.settleReading();
      return;
    }
    this.beginAction();
    this.setData({ sourceMounted: true, sourceOpen: true, sceneShift: this.data.detailShift, readingScroll: 0 });
    this.resetReadingScroll();
  },
  closeSource() {
    const action = this.beginAction();
    this._sceneResetAt = Date.now() + 340;
    this.setData({ sourceOpen: false, sceneShift: 0, readingScroll: 0 });
    this.resetReadingScroll();
    this.later(action, 340, () => this.setData({ sourceMounted: false }));
  },
  openSeed() {
    if (this.data.loading) return;
    if (!this.data.snapshotReady && !this.data.graphicsError) {
      this._afterReading = 'seed';
      if (this.data.phase !== 'settling') this.settleReading();
      return;
    }
    const action = this.beginAction();
    this.setData({ overlay: 'seed', overlayVisible: false, readingVisible: false, draft: '', inputFocus: false, keyboardHeight: 0 }, () => {
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
    const ordinal = modulo(this.data.active.ordinal - 1 + direction, this._session.frames.length);
    const index = this._readingLines.findIndex(line => line.ordinal === ordinal + 1);
    const action = this.beginAction();
    const delay = this.data.sourceOpen ? 340 : 180;
    this.setData({ sourceOpen: false, sceneShift: 0, readingVisible: false, phase: 'settling' });
    this.later(action, delay, () => {
      this.setData({ sourceMounted: false, readingScroll: 0 });
      const target = (index + 0.46) * CELL;
      if (this.data.graphicsError) {
        this._timeline.position = target; this.updateActive(true);
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
  onReadingScroll(event) { this._readingScrollTop = event.detail.scrollTop; },
  resetReadingScroll() {
    this.setData({ readingScroll: this._readingScrollTop || 1 }, () => this.setData({ readingScroll: 0 }));
    this._readingScrollTop = 0;
  },
  retry() { this.loadSession(this.data.seed); },
  swallow() {},
  pulse() { if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail() {} }); },
  getFlowState() {
    return { index: this._timeline.index, position: this._timeline.position,
      running: !!this._renderer && this._renderer.running, visible: this._visible,
      paused: this.data.paused, phase: this.data.phase, snapshotReady: this.data.snapshotReady,
      mode: this.data.graphicsError ? 'static' : 'webgl', journey: this._session && this._session.journey,
      glyphMode: this._renderer ? this._renderer.glyphMode : null,
      graphicsError: this.data.graphicsError, graphicsFailure: this._graphicsFailure || null,
      glError: this._renderer ? this._renderer.gl.getError() : null };
  },
});
