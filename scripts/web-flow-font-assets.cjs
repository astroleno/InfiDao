// Build-time only: derive a web manifest without changing native font assets.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function createWebFontRelease(root) {
  const native = JSON.parse(fs.readFileSync(path.join(root, 'public/flow-fonts/manifest.json'), 'utf8'));
  const metadata = require(path.join(root, 'miniprogram/assets/fonts/manifest.js'));
  const bases = [['serif', metadata.family], ['supplement', metadata.supplementFamily]].map(([name, family]) => {
    const bytes = Buffer.from(require(path.join(root, `miniprogram/assets/fonts/${name}-data.js`)), 'base64');
    if (bytes.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Invalid base WOFF font');
    const sha256 = sha(bytes), id = 'base-' + name + '-' + sha256.slice(0, 20);
    return { bytes, asset: { id, file: id + '.woff', family, bytes: bytes.length, sha256 } };
  });
  const shards = native.shards.map(shard => {
    if (!/^[a-z0-9_-]+\.woff$/.test(shard.file)) throw new Error('Invalid font shard name');
    const bytes = fs.readFileSync(path.join(root, 'public/flow-fonts', shard.file));
    if (bytes.length !== shard.bytes || sha(bytes) !== shard.sha256) throw new Error('Font shard integrity failed: ' + shard.file);
    return { bytes, asset: shard };
  });
  const content = { ...native, originalVersion: native.version, baseCharacters: metadata.characters, baseFonts: bases.map(item => item.asset) };
  const manifest = { ...content, version: sha(JSON.stringify(content)).slice(0, 20) };
  return { manifest, manifestBytes: Buffer.from(JSON.stringify(manifest) + '\n'), assets: [...bases, ...shards] };
}

module.exports = { createWebFontRelease };
