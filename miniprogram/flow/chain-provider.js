const { createCuratedProvider } = require('./curated-provider');
const { createRemoteProvider } = require('./remote-provider');
const { serviceOrigin } = require('./config');
const { readPreviewKey } = require('./native-settings');

function createChainProvider(api) {
  const previewKey = readPreviewKey(api);
  if (previewKey) return require('./native-provider').createNativeProvider(api, previewKey);
  let origin = serviceOrigin;
  try {
    if (api.getDeviceInfo && api.getDeviceInfo().platform === 'devtools') origin = api.getStorageSync('infidao-flow-service') || origin;
  } catch (_) {}
  if (!origin) return createCuratedProvider();
  if (!/^https:\/\//.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw new Error('Flow service requires HTTPS');
  let ready = null;
  function connect() {
    if (ready) return ready;
    const key = 'infidao-flow-identity:' + origin;
    let token;
    try { token = api.getStorageSync(key); } catch (_) {}
    const pending = new Promise((resolve, reject) => {
      api.request({ url: origin.replace(/\/$/, '') + '/api/flow/session', method: 'POST', timeout: 15000,
        header: { 'Content-Type': 'application/json', 'x-flow-client': 'native', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        data: {}, success(result) {
          if (result.statusCode !== 200 || typeof result.data?.token !== 'string') {
            reject(Object.assign(new Error(result.data?.error?.message || '暂时无法连接阅读服务。'), { code: result.data?.error?.code || 'INVALID_SESSION' })); return;
          }
          try { api.setStorageSync(key, result.data.token); } catch (_) {}
          resolve(createRemoteProvider(api, origin, result.data.token));
        }, fail(error) { reject(new Error(error.errMsg || '暂时无法连接阅读服务。')); },
      });
    }).catch(error => { if (ready === pending) ready = null; throw error; });
    ready = pending; return pending;
  }
  const provider = { kind: 'remote', origin };
  for (const method of ['open', 'branch', 'next', 'resume']) provider[method] = (input, options) => {
    let inner, cancelled = false, cancel;
    const pending = connect();
    const operation = pending.then(remote => {
      if (cancelled) throw Object.assign(new Error('CANCELLED'), { cancelled: true });
      inner = remote[method](input, options); return inner;
    }).catch(error => { if (error.code === 'INVALID_SESSION' && ready === pending) ready = null; throw error; });
    const promise = Promise.race([operation, new Promise((_, reject) => { cancel = reject; })]);
    promise.cancel = () => { cancelled = true; if (inner?.cancel) inner.cancel(); cancel(Object.assign(new Error('CANCELLED'), { cancelled: true })); };
    return promise;
  };
  return provider;
}
module.exports = { createChainProvider };
