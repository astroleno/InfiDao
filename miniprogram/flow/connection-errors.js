// Only fixed messages and numeric status codes may cross into the UI.
// Raw request errors can contain headers or echoed credentials.
class ConnectionError extends Error {
  constructor(code, message, httpStatus) {
    super(message); this.code = code;
    if (httpStatus) this.httpStatus = httpStatus;
  }
}
function connectionError(code, message, httpStatus) { return new ConnectionError(code, message, httpStatus); }
function isConnectionError(error) { return error instanceof ConnectionError; }

function httpError(status) {
  const messages = {
    400: ['DS_REQUEST_INVALID', '连接请求格式不正确，请把下方诊断信息发给开发者。'],
    401: ['DS_KEY_INVALID', 'DS 未认可这枚 API Key，请确认使用的是 DS 平台的完整 Key。'],
    402: ['DS_BALANCE_EMPTY', 'DS 账户余额不足，请在 DS 平台查看额度。'],
    403: ['DS_ACCESS_DENIED', 'DS 拒绝了这次访问，请检查账户权限。'],
    404: ['DS_NOT_FOUND', 'DS 接口或模型暂不可用，请把下方诊断信息发给开发者。'],
    422: ['DS_PARAMETERS_INVALID', 'DS 未接受当前请求参数，请把下方诊断信息发给开发者。'],
    429: ['DS_RATE_LIMITED', 'DS 请求过于频繁，请稍候再试。'],
    500: ['DS_SERVER_ERROR', 'DS 服务暂时异常，请稍后再试。'],
    503: ['DS_BUSY', 'DS 服务繁忙，请稍后再试。'],
  };
  const value = messages[status] || ['DS_HTTP_ERROR', 'DS 暂未完成连接，请稍后再试。'];
  return connectionError(value[0], value[1], Number.isInteger(status) ? status : undefined);
}

function networkError(error) {
  if (error?.cancelled) return error;
  const message = String(error?.errMsg || error?.message || '');
  if (/not in domain list|url.*domain|domain.*list|域名/i.test(message)) {
    return connectionError('WX_DOMAIN_BLOCKED', '微信拦截了 DS 的请求。请开启预览调试；若仍被拦截，从右上角打开调试后退出并重新进入预览。');
  }
  if (/timeout|timed out|超时/i.test(message)) return connectionError('NETWORK_TIMEOUT', '连接 DS 超时，请切换 Wi-Fi 或移动网络后重试。');
  if (/ssl|tls|certificate|证书/i.test(message)) return connectionError('TLS_FAILED', '与 DS 的安全连接未建立，请检查手机时间或切换网络后重试。');
  if (/resolve|dns|host.*found/i.test(message)) return connectionError('DNS_FAILED', '当前网络无法找到 DS 服务，请切换网络后重试。');
  return connectionError('NETWORK_FAILED', '当前网络未能连接 DS，请切换网络后重试。');
}

function debugEnabled(api) {
  try {
    const info = api.getAppBaseInfo ? api.getAppBaseInfo() : api.getSystemInfoSync();
    return info.enableDebug === true;
  } catch (_) { return false; }
}

function diagnostic(stage, error, api) {
  const stages = { key: '检查 Key', auth: '验证连接', corpus: '加载经文', storage: '保存连接', navigation: '进入经轮', debug: '开启调试' };
  // Callers pass only errors made by this module, not model response bodies.
  const code = /^[A-Z_]+$/.test(error.code || '') ? error.code : 'CONNECTION_FAILED';
  return [stages[stage] || '连接', code, error.httpStatus ? 'HTTP ' + error.httpStatus : '',
    debugEnabled(api) ? '调试已开启' : '调试未开启'].filter(Boolean).join(' · ');
}

module.exports = { connectionError, isConnectionError, httpError, networkError, debugEnabled, diagnostic };
