const { hasGlyph, installFont } = require('./glyph-outline');

// Sequential, deduplicated downloads. A prepared scene never depends on the
// iPhone Canvas font registry; both bundled and remote glyphs use font paths.
function createChainFonts(api, origin) {
  let manifest, pendingManifest, queue = Promise.resolve();
  const downloading = new Map();
  let downloads = 0, bytes = 0;
  function request(path, binary) {
    return new Promise((resolve, reject) => api.request({ url: origin + '/flow-fonts/' + path,
      responseType: binary ? 'arraybuffer' : 'text', timeout: 15000,
      success: result => result.statusCode === 200 ? resolve(result.data) : reject(new Error('FONT_UNAVAILABLE')), fail: reject }));
  }
  async function ensure(chain) {
    const chars = Array.from(new Set(Array.from(chain.frames.map(frame => frame.quote).join('')))).filter(char => !hasGlyph(char));
    if (!chars.length) return { ...chain, fontUnavailable: false };
    if (!origin) return { ...chain, fontUnavailable: true };
    try {
      if (!manifest) {
        if (!pendingManifest) pendingManifest = request('manifest.json', false).then(value => typeof value === 'string' ? JSON.parse(value) : value).catch(error => { pendingManifest = null; throw error; });
        manifest = await pendingManifest;
      }
      const needed = manifest.shards.filter(shard => chars.some(char => shard.characters.includes(char)));
      for (const shard of needed) {
        if (Array.from(shard.characters).every(hasGlyph)) continue;
        if (!downloading.has(shard.id)) {
          const job = queue.catch(() => {}).then(async () => {
            const buffer = await request(shard.file, true);
            if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== shard.bytes) throw new Error('FONT_INCOMPLETE');
            installFont(shard.id, shard.characters, buffer);
            downloads++; bytes += buffer.byteLength;
          });
          downloading.set(shard.id, job); queue = job;
          job.finally(() => downloading.delete(shard.id)).catch(() => {});
        }
        await downloading.get(shard.id);
      }
      if (!chars.every(hasGlyph)) throw new Error('FONT_UNCOVERED');
      return { ...chain, fontUnavailable: false };
    } catch (_) { return { ...chain, fontUnavailable: true }; }
  }
  return { prepare: ensure, stats: () => ({ downloads, bytes, pending: downloading.size, manifest: manifest?.version || null }) };
}
module.exports = { createChainFonts };
