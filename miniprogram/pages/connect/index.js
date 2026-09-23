const { previewAllowed, readPreviewKey, savePreviewKey, clearPreviewKey } = require('../../flow/native-settings');
const { connectionError, isConnectionError, httpError, networkError, debugEnabled, diagnostic } = require('../../flow/connection-errors');

Page({
  data: { allowed: false, saved: false, busy: false, error: '', diagnosis: '', status: '', keyInput: '', top: 100, canReturn: false, debug: false },
  onLoad() {
    this._alive = true;
    this._connectionChanged = false;
    const info = wx.getWindowInfo();
    const pages = getCurrentPages();
    this.setData({ allowed: previewAllowed(wx), saved: !!readPreviewKey(wx), top: Math.max(88, (info.statusBarHeight || 44) + 64),
      canReturn: pages.length > 1 && pages[pages.length - 2].route === 'pages/flow/index' });
  },
  onShow() { this.setData({ debug: debugEnabled(wx) }); },
  onUnload() { this._alive = false; this._draft = ''; if (this._request) this._request.abort(); },
  onKeyInput(event) { this._draft = event.detail.value; },
  async connect() {
    if (this.data.busy || !this.data.allowed) return;
    const key = (this._draft || readPreviewKey(wx)).trim();
    if (key.length < 16 || key.length > 256 || /\s/.test(key)) {
      this.showConnectionError('key', connectionError('KEY_FORMAT_INVALID', '请只粘贴完整的 API Key，不含引号或 Bearer 前缀。')); return;
    }
    let stage = 'auth';
    this.setData({ busy: true, error: '', diagnosis: '', status: '正在验证连接…' });
    try {
      await new Promise((resolve, reject) => {
        this._request = wx.request({ url: 'https://api.deepseek.com/models', method: 'GET', timeout: 15000,
          header: { Authorization: 'Bearer ' + key },
          success(response) {
            if (response.statusCode !== 200) { reject(httpError(response.statusCode)); return; }
            try {
              const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              if (!Array.isArray(result?.data)) throw new Error();
              if (!result.data.some(model => model.id === 'deepseek-flash')) {
                reject(connectionError('DS_MODEL_UNAVAILABLE', '连接已通过，但 DS 尚未提供当前使用的 Flash 模型。')); return;
              }
              resolve();
            } catch (_) { reject(connectionError('DS_RESPONSE_INVALID', 'DS 返回的连接验证不完整，请稍后重试。')); }
          }, fail(error) { reject(networkError(error)); },
        });
      });
      if (!this._alive) return;
      stage = 'corpus';
      this.setData({ status: 'Key 已通过，正在载入经文…' });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(connectionError('CORPUS_TIMEOUT', 'Key 已通过，但经文下载超时，请检查网络后重试。')), 30000);
        Promise.resolve().then(() => require('../../flow/generated/resources').loadCorpus())
          .then(resolve, () => reject(connectionError('CORPUS_LOAD_FAILED', 'Key 已通过，但经文未能下载完整，请检查网络后重试。')))
          .finally(() => clearTimeout(timer));
      });
      if (!this._alive) return;
      stage = 'storage';
      savePreviewKey(wx, key); this._draft = ''; this._connectionChanged = true;
      this.setData({ keyInput: '', saved: true, status: '' });
      stage = 'navigation';
      await new Promise((resolve, reject) => wx.reLaunch({ url: '/pages/flow/index', success: resolve,
        fail: () => reject(connectionError('PAGE_OPEN_FAILED', '连接已保存，但经轮未打开，请再试一次。')) }));
    } catch (error) {
      if (this._alive) {
        const safe = stage === 'storage' ? connectionError('KEY_SAVE_FAILED', 'Key 已通过，但手机未能保存连接，请检查微信可用空间。') :
          isConnectionError(error) ? error : networkError(error);
        this.showConnectionError(stage, safe);
      }
    } finally { if (this._alive) this.setData({ busy: false }); this._request = null; }
  },
  showConnectionError(stage, error) {
    this.setData({ error: error.message, diagnosis: diagnostic(stage, error, wx), status: '', debug: debugEnabled(wx) });
  },
  enablePreviewDebug() {
    if (this.data.busy || !this.data.allowed) return;
    const failed = () => {
      if (this._alive) this.showConnectionError('debug', connectionError('WX_DEBUG_UNAVAILABLE', '请从右上角「⋯」手动打开调试，再重新进入预览。'));
    };
    try {
      wx.setEnableDebug({ enableDebug: true,
        success: () => {
          if (!this._alive) return;
          if (debugEnabled(wx)) this.setData({ debug: true, error: '', diagnosis: '' });
          else this.showConnectionError('debug', connectionError('WX_DEBUG_REOPEN_REQUIRED', '调试开关尚未生效，请从右上角「⋯」打开调试，再退出并重新进入预览。'));
        }, fail: failed });
    } catch (_) { failed(); }
  },
  clear() {
    if (this.data.busy) return;
    if (readPreviewKey(wx)) this._connectionChanged = true;
    clearPreviewKey(wx); this._draft = ''; this.setData({ saved: false, keyInput: '', error: '', diagnosis: '', status: '' });
  },
  returnToFlow() {
    if (this.data.busy || !this.data.canReturn) return;
    if (this._connectionChanged) wx.reLaunch({ url: '/pages/flow/index' });
    else wx.navigateBack();
  },
  readOffline() {
    if (this.data.busy) return;
    clearPreviewKey(wx); wx.reLaunch({ url: '/pages/flow/index' });
  },
});
