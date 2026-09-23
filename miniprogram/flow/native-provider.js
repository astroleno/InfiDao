const { hasGlyph, installFont } = require('./glyph-outline');
const { typography } = require('./typography');
const { httpError, networkError } = require('./connection-errors');
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const cancelled = () => Object.assign(new Error('CANCELLED'), { cancelled: true });

function createControl() {
  let aborted = false; const listeners = new Set();
  return { signal: {
    get aborted() { return aborted; },
    throwIfAborted() { if (aborted) throw cancelled(); },
    addEventListener(type, fn) { if (type === 'abort') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'abort') listeners.delete(fn); },
  }, abort() { if (!aborted) { aborted = true; listeners.forEach(fn => fn()); listeners.clear(); } } };
}

const modelError = networkError;

function createNativeProvider(api, key, dependencies) {
  const resources = dependencies?.resources || require('./generated/resources');
  const factory = dependencies?.factory || require('./generated/local-core');
  let random, at = 0, randomJob;
  const refill = async () => {
    if (random && random.length - at >= 512) return;
    if (!randomJob) randomJob = new Promise((resolve, reject) => api.getRandomValues({ length: 4096,
      success(result) { random = new Uint8Array(result.randomValues); at = 0; resolve(); }, fail: reject,
    })).finally(() => { randomJob = null; });
    await randomJob;
  };
  const host = {
    config: () => ({ model: MODEL }), loadCorpus: () => resources.loadCorpus(),
    randomUUID() {
      if (!random || at + 16 > random.length) throw new Error('RANDOM_NOT_READY');
      const bytes = random.slice(at, at += 16); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
    },
    flowJson(system, input, signal) {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        let task, finished = false;
        const finish = (error, value) => {
          if (finished) return; finished = true; signal.removeEventListener('abort', abort);
          if (error) reject(error); else resolve(value);
        };
        const abort = () => { finish(cancelled()); if (task) task.abort(); };
        signal.addEventListener('abort', abort);
        try {
          task = api.request({ url: ENDPOINT, method: 'POST', timeout: 18000,
            header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            data: { model: MODEL, thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
              max_tokens: 4608, temperature: 0.2, stream: false,
              messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] },
            success(response) {
              if (finished) return;
              if (response.statusCode !== 200) { finish(httpError(response.statusCode)); return; }
              try {
                signal.throwIfAborted();
                const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                if (result.choices?.[0]?.finish_reason === 'length') throw new Error('模型返回未完成');
                finish(null, JSON.parse(result.choices?.[0]?.message?.content || ''));
              } catch (_) { finish(new Error('这条联系还不完整，可以再试一次。')); }
            }, fail(error) { finish(modelError(error)); },
          });
          if (signal.aborted) abort();
        } catch (error) { finish(modelError(error)); }
      });
    },
  };
  const core = factory(host), owner = 'this-device';
  const provider = { kind: 'native', origin: '' };
  for (const op of ['open', 'branch', 'next']) provider[op] = (input, hooks = {}) => {
    const control = createControl(); let done;
    const promise = (async () => {
      await refill(); control.signal.throwIfAborted();
      const request = { op, requestId: hooks.requestId || host.randomUUID(), ...(op === 'open' && typeof input === 'string' ? { seed: input } : input) };
      await core.runFlow(request, owner, control.signal, event => {
        control.signal.throwIfAborted();
        if (event.type === 'done') done = event.chain;
        if (hooks.onEvent) hooks.onEvent(event);
      });
      control.signal.throwIfAborted();
      if (!done) throw new Error('这条联系尚未完整到来。');
      return done;
    })();
    promise.cancel = () => control.abort(); return promise;
  };
  provider.resume = input => provider.open(input);
  const pendingFonts = new Map(); let count = 0, bytes = 0;
  provider.fonts = {
    async prepare(chain) {
      const quotes = Array.from(new Set(Array.from(chain.frames.map(frame => frame.quote).join(''))));
      const chars = Array.from(new Set(Array.from(chain.frames.map(frame => frame.fullText || frame.quote).join(''))));
      if (!chars.length) return { ...chain, fontUnavailable: false };
      try {
        const needed = resources.manifest.shards.filter(shard => chars.some(char => shard.characters.includes(char)));
        for (const shard of needed) {
          if (!pendingFonts.has(shard.id)) pendingFonts.set(shard.id, resources.loadFont(shard.id).then(async data => {
            // Fonts are public base64 modules; no file-system buffer crosses a
            // JS realm, and the existing font parser remains the source of truth.
            if (typeof data !== 'string') throw new Error('FONT_INCOMPLETE');
            const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
            if (data.length * 3 / 4 - padding !== shard.bytes) throw new Error('FONT_INCOMPLETE');
            installFont(shard.id, shard.characters, data); count++; bytes += shard.bytes;
            await typography.prepareShard(api, shard.id, data);
          }).catch(error => { pendingFonts.delete(shard.id); throw error; }));
          await pendingFonts.get(shard.id);
        }
        if (!quotes.every(hasGlyph)) throw new Error('FONT_UNCOVERED');
        return { ...chain, fontUnavailable: false };
      } catch (_) { return { ...chain, fontUnavailable: true }; }
    }, stats: () => ({ downloads: count, bytes, manifest: resources.manifest.version, native: true }),
  };
  return provider;
}
module.exports = { createNativeProvider, createControl, modelError };
