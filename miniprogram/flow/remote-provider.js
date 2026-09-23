// UTF-8 and NDJSON boundaries are independent of native network chunks.
// TextDecoder is not available on every supported WeChat JavaScript runtime.
function createEventDecoder(onEvent) {
  let pending = [], text = '';
  function push(buffer, final = false) {
    const bytes = pending.concat(Array.from(new Uint8Array(buffer || new ArrayBuffer(0))));
    pending = [];
    let i = 0;
    while (i < bytes.length) {
      const lead = bytes[i], width = lead < 128 ? 1 : lead >= 194 && lead < 224 ? 2 : lead < 240 && lead >= 224 ? 3 : lead < 245 && lead >= 240 ? 4 : 0;
      if (!width) throw new Error('INVALID_UTF8');
      if (i + width > bytes.length) { pending = bytes.slice(i); break; }
      let point = lead & (width === 1 ? 127 : (1 << (7 - width)) - 1);
      for (let j = 1; j < width; j++) {
        if ((bytes[i + j] & 192) !== 128) throw new Error('INVALID_UTF8');
        point = (point << 6) | (bytes[i + j] & 63);
      }
      if ((width > 1 && point < [0, 0, 128, 2048, 65536][width]) || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error('INVALID_UTF8');
      text += String.fromCodePoint(point); i += width;
    }
    if (text.length > 1024 * 1024) throw new Error('RESPONSE_TOO_LARGE');
    let at;
    while ((at = text.indexOf('\n')) >= 0) {
      const line = text.slice(0, at).trim(); text = text.slice(at + 1);
      if (line) onEvent(JSON.parse(line));
    }
    if (final) {
      if (pending.length) throw new Error('INCOMPLETE_UTF8');
      if (text.trim()) onEvent(JSON.parse(text)); text = '';
    }
  }
  return { push };
}

function requestId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }

function createRemoteProvider(api, origin, sessionId) {
  function request(payload, options = {}) {
    let task, stopped = false, sawChunks = false, finalChain, settleReject;
    const id = options.requestId || requestId();
    const promise = new Promise((resolve, reject) => {
      settleReject = reject;
      function event(value) {
        if (stopped || value.requestId !== id) return;
        if (value.type === 'error') { const error = new Error(value.message); error.code = value.code; throw error; }
        if (value.type === 'done') finalChain = value.chain;
        if (options.onEvent) options.onEvent(value);
      }
      const decoder = createEventDecoder(event);
      const fail = error => { if (!stopped) { stopped = true; if (task) task.abort(); reject(error); } };
      task = api.request({
        url: origin.replace(/\/$/, '') + '/api/flow', method: 'POST', timeout: 45000,
        enableChunked: true, responseType: 'arraybuffer',
        header: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'x-flow-session': sessionId },
        data: { ...payload, requestId: id },
        success(result) {
          if (stopped) return;
          try {
            if (result.statusCode < 200 || result.statusCode >= 300) throw new Error('内容服务暂不可用，请稍后再试。');
            if (!sawChunks) {
              if (result.data instanceof ArrayBuffer) decoder.push(result.data, true);
              else if (result.data && Array.isArray(result.data.events)) result.data.events.forEach(event);
              else if (typeof result.data === 'string') {
                const parsed = result.data.trim().startsWith('{"events"') ? JSON.parse(result.data) : null;
                if (parsed) parsed.events.forEach(event); else result.data.split('\n').filter(Boolean).forEach(line => event(JSON.parse(line)));
              }
            } else decoder.push(null, true);
            if (!finalChain) throw new Error('这条联系尚未完整到来，请再试一次。');
            stopped = true; resolve(finalChain);
          } catch (error) { fail(error); }
        },
        fail(error) { fail(new Error(error.errMsg || '网络暂时未连接，原句仍可阅读。')); },
      });
      if (task.onChunkReceived) task.onChunkReceived(({ data }) => {
        if (stopped) return;
        sawChunks = true;
        try { decoder.push(data); } catch (error) { fail(error); }
      });
    });
    promise.cancel = () => {
      if (stopped) return;
      stopped = true; if (task) task.abort();
      const error = new Error('CANCELLED'); error.cancelled = true; settleReject(error);
    };
    return promise;
  }
  return { kind: 'remote', origin,
    open: (seed, options) => request({ op: 'open', seed }, options),
    branch: (input, options) => request({ op: 'branch', ...input }, options),
    next: (input, options) => request({ op: 'next', ...input }, options),
  };
}

module.exports = { createEventDecoder, createRemoteProvider, requestId };
