const { createMockProvider, validateSession, DEFAULT_SEED } = require('../../flow/provider');
const { FlowTimeline } = require('../../flow/timeline');
const { WheelRenderer } = require('../../flow/renderer');
const { readingLines } = require('../../flow/scene');

Page({
  data: {
    ready: false,
    loading: true,
    error: '',
    graphicsError: false,
    staticMode: false,
    paused: false,
    overlay: '',
    seed: DEFAULT_SEED,
    draft: '',
    active: null,
    ordinal: '01',
    total: '08',
    headerTop: 56,
    sceneTop: 96,
    sceneHeight: 652,
    bottomInset: 28,
    keyboardHeight: 0,
    inputFocus: false,
    hintVisible: true,
  },

  onLoad() {
    this._alive = true;
    this._visible = true;
    this._request = 0;
    this._provider = createMockProvider();
    this._timeline = new FlowTimeline(8);
    this.readWindow();
  },

  onReady() {
    this.loadSession(DEFAULT_SEED);
  },

  onShow() {
    this._visible = true;
    if (this._timeline) this._timeline.setVisible(true);
    this.syncMotion();
  },

  onHide() {
    this._visible = false;
    if (this._timeline) this._timeline.setVisible(false);
    if (this._renderer) this._renderer.stop();
  },

  onUnload() {
    this._alive = false;
    this._request++;
    clearTimeout(this._hintTimer);
    if (this._renderer) this._renderer.destroy();
  },

  onResize() {
    if (this.data.overlay === 'seed') return;
    this.readWindow();
    if (this._session && !this.data.graphicsError) this.initRenderer();
  },

  readWindow() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._window = info;
    const safe = info.safeArea;
    const bottomInset = Math.max(18, safe ? info.screenHeight - safe.bottom + 14 : 30);
    // Native WebGL canvas covers any DOM above it, so the footer/hint strip
    // stays outside the canvas; the wheel takes everything else. Keep the
    // strip as thin as the controls allow.
    const strip = Math.max(64, bottomInset + 40);
    const sceneTop = Math.round(strip * 0.35);
    this.setData({
      headerTop: (info.statusBarHeight || 24) + 14,
      bottomInset,
      sceneTop,
      sceneHeight: info.windowHeight - strip - sceneTop,
    });
  },

  async loadSession(seed) {
    const request = ++this._request;
    this.setData({ loading: true, error: '', inputFocus: false });
    this.syncMotion();
    try {
      const session = validateSession(await this._provider.open(seed));
      if (!this._alive || request !== this._request) return;
      this._session = session;
      this._readingLines = readingLines(session.frames);
      this._timeline = new FlowTimeline(this._readingLines.length);
      this._timeline.setVisible(this._visible);
      this.setData({
        seed: session.seed,
        overlay: '',
        paused: false,
        keyboardHeight: 0,
        active: this._readingLines[0],
        ordinal: '01',
        total: String(this._readingLines.length).padStart(2, '0'),
        loading: false,
      });
      if (this.data.graphicsError) {
        this.setData({ ready: true });
        return;
      }
      this.initRenderer();
    } catch (error) {
      if (!this._alive || request !== this._request) return;
      this.setData({ loading: false, error: '这一次还没展开，轻点重试。' });
      this.syncMotion();
    }
  },

  initRenderer() {
    if (!this._alive || !this._session) return;
    if (this._renderer) {
      this._renderer.destroy();
      this._renderer = null;
    }
    const request = this._request;
    const generation = this._renderGeneration = (this._renderGeneration || 0) + 1;
    this.createSelectorQuery()
      .select('#ribbon').fields({ node: true, size: true })
      .select('#glyph-atlas').fields({ node: true, size: true })
      .exec(results => {
        if (!this._alive || request !== this._request || generation !== this._renderGeneration) return;
        try {
          if (!results[0] || !results[0].node || !results[1] || !results[1].node) throw new Error('Canvas unavailable');
          this._renderer = new WheelRenderer(results[0].node, results[1].node, {
            timeline: this._timeline,
            width: results[0].width || this._window.windowWidth,
            height: results[0].height || this.data.sceneHeight,
            dpr: this._window.pixelRatio,
            onFrame: () => this.onWheelFrame(),
            onError: error => this.graphicsFailed(error),
          });
          this._renderer.setFrames(this._readingLines);
          this._graphicsFailure = null;
          this.setData({ ready: true, graphicsError: false });
          this.syncMotion();
          clearTimeout(this._hintTimer);
          this._hintTimer = setTimeout(() => {
            if (this._alive) this.setData({ hintVisible: false });
          }, 9000);
        } catch (error) {
          this.graphicsFailed(error);
        }
      });
  },

  graphicsFailed(error) {
    if (!this._alive) return;
    this._graphicsFailure = error.message || (error.detail && error.detail.errMsg) || String(error);
    console.warn('[InfiDao] Wheel unavailable:', error.message || String(error));
    if (this._renderer) this._renderer.destroy();
    this._renderer = null;
    this.setData({ ready: true, graphicsError: true, staticMode: true });
  },

  syncMotion() {
    if (!this._timeline) return;
    this._timeline.paused = this.data.paused || this.data.overlay !== '' || this.data.loading || this.data.staticMode || !!this.data.error;
    if (!this._renderer) return;
    // A fling keeps the render loop alive even while paused, so the glide is
    // visible before the detent settle takes over.
    const gliding = this._timeline.flinging;
    if (this._visible && (!this._timeline.paused || gliding) && !this._timeline.dragging) this._renderer.start();
    else this._renderer.stop();
  },

  onWheelFrame() {
    this.updateActive();
    if (!this._timeline || !this._timeline.needsSettle) return;
    this._timeline.needsSettle = false;
    if (this.data.paused && this._renderer) this._renderer.center();
  },

  updateActive(force) {
    if (!this._session) return;
    const index = this._timeline.index;
    if (force || this.data.active.id !== this._readingLines[index].id) {
      this.setData({ active: this._readingLines[index], ordinal: String(index + 1).padStart(2, '0') });
    }
  },

  togglePause() {
    if (this._timeline) this._timeline.cancelFling();
    this.setData({ paused: !this.data.paused, hintVisible: false });
    this.syncMotion();
    if (this.data.paused && this._renderer) { this.pulse(); this._renderer.center(); }
  },

  onPauseControl() {
    if (!this.data.ready) return;
    if (this.data.staticMode) this.toggleStatic();
    else this.togglePause();
  },

  onTouchStart(event) {
    if (!this._renderer || this.data.overlay || this.data.loading) return;
    const touch = event.touches[0];
    if (!touch) return;
    this._suppressTap = false;
    // Grabbing a gliding wheel catches it in place.
    this._timeline.cancelFling();
    this._touch = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastT: event.timeStamp, moved: false };
    this._timeline.dragging = true;
    this.syncMotion();
  },

  onTouchMove(event) {
    if (!this._touch || !this._renderer) return;
    const touch = event.touches[0];
    if (!touch) return;
    const distance = Math.hypot(touch.clientX - this._touch.x, touch.clientY - this._touch.y);
    if (distance > 7) this._touch.moved = true;
    const now = event.timeStamp;
    if (this._touch.moved) {
      this._timeline.scrub(touch.clientY - this._touch.lastY, this._renderer.scrollPitch, (now - this._touch.lastT) / 1000);
      try { this._renderer.draw(); } catch (error) { this.graphicsFailed(error); }
      this.updateActive();
    }
    this._touch.lastY = touch.clientY;
    this._touch.lastT = now;
  },

  onTouchEnd() {
    if (!this._touch) return;
    this._suppressTap = this._touch.moved;
    this._suppressTapUntil = this._suppressTap ? Date.now() + 200 : 0;
    this._touch = null;
    // A fast release glides on (fling); a slow one rests. When the glide dies
    // out, onWheelFrame hands over to the detent settle.
    const flung = this._timeline.release();
    this._timeline.dragging = false;
    this.syncMotion();
    if (this._suppressTap && this.data.paused && this._renderer && !flung) this._renderer.center();
  },

  onCanvasTap() {
    if (this._suppressTap && Date.now() < this._suppressTapUntil) { this._suppressTap = false; return; }
    this._suppressTap = false;
    if (this._renderer && !this.data.loading && !this.data.overlay) this.togglePause();
  },

  onTouchCancel() {
    this._touch = null;
    this._timeline.cancelFling();
    this._timeline.dragging = false;
    this.syncMotion();
  },

  openSource() {
    if (!this.data.active) return;
    this.updateActive(true);
    this.setData({ overlay: 'source', hintVisible: false });
    this.pulse();
    this.syncMotion();
  },

  openSeed() {
    this.setData({ overlay: 'seed', draft: '', inputFocus: true, keyboardHeight: 0 });
    this.pulse();
    this.syncMotion();
  },

  closeOverlay() {
    this.setData({ overlay: '', inputFocus: false, keyboardHeight: 0 });
    wx.hideKeyboard();
    this.syncMotion();
  },

  onSeedInput(event) { this.setData({ draft: event.detail.value }); },
  onKeyboardHeight(event) { this.setData({ keyboardHeight: event.detail.height || 0 }); },

  submitSeed() {
    const seed = this.data.draft.trim();
    if (!seed || this.data.loading) return;
    wx.hideKeyboard();
    this.loadSession(seed);
  },

  usePrompt(event) {
    wx.hideKeyboard();
    this.loadSession(event.currentTarget.dataset.seed);
  },

  toggleStatic() {
    if (this.data.graphicsError) {
      this.setData({ staticMode: false, graphicsError: false, ready: false, overlay: '', paused: false });
      this.initRenderer();
      return;
    }
    const staticMode = !this.data.staticMode;
    this.setData({ staticMode, overlay: '', paused: staticMode ? this.data.paused : false });
    if (!this.data.staticMode && this._renderer) this._renderer.draw();
    this.syncMotion();
  },

  previous() { this.pulse(); this._timeline.move(-1); this.updateActive(true); },
  next() { this.pulse(); this._timeline.move(1); this.updateActive(true); },
  retry() { this.loadSession(this.data.seed); },
  swallow() {},

  pulse() {
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  getFlowState() {
    return {
      index: this._timeline.index,
      position: this._timeline.position,
      running: !!this._renderer && this._renderer.running,
      visible: this._visible,
      paused: this.data.paused,
      mode: this.data.staticMode ? 'static' : 'webgl',
      journey: this._session && this._session.journey,
      graphicsError: this.data.graphicsError,
      graphicsFailure: this._graphicsFailure || null,
      glError: this._renderer ? this._renderer.gl.getError() : null,
    };
  },
});
