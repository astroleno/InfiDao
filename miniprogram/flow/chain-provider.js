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
  const ready = new Promise((resolve, reject) => {
    let token;
    try { token = api.getStorageSync('infidao-flow-session'); } catch (_) {}
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) { resolve(token); return; }
    api.getRandomValues({ length: 32, success: result => {
      const value = Array.from(new Uint8Array(result.randomValues)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      try { api.setStorageSync('infidao-flow-session', value); } catch (_) {}
      resolve(value);
    }, fail: reject });
  }).then(token => createRemoteProvider(api, origin, token));
  const provider = { kind: 'remote', origin };
  for (const method of ['open', 'branch', 'next', 'resume']) provider[method] = (input, options) => {
    let inner, cancelled = false;
    const promise = ready.then(remote => {
      if (cancelled) throw Object.assign(new Error('CANCELLED'), { cancelled: true });
      inner = remote[method](input, options); return inner;
    });
    promise.cancel = () => { cancelled = true; if (inner?.cancel) inner.cancel(); };
    return promise;
  };
  return provider;
}
module.exports = { createChainProvider };
