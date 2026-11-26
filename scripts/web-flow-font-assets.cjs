// Build-time only: derive a web manifest without changing native font assets.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function createWebFontRelease(root) {
  const native = JSON.parse(fs.readFileSync(path.join(root, 'public/flow-fonts/manifest.json'), 'utf8'));
  const metadata = require(path.join(root, 'miniprogram/assets/fonts/manifest.js'));
  const scDirectory = path.join(root, 'public/flow-fonts/web-sc/reviewed');
  const correction = JSON.parse(fs.readFileSync(path.join(scDirectory, 'manifest.json'), 'utf8'));
  const corrected = new Set(correction.characters);
  const originalCoverage = new Set(Array.from(metadata.characters));
  for (const shard of native.shards) for (const char of shard.characters) originalCoverage.add(char);
  for (const char of corrected) {
    if (!originalCoverage.has(char)) throw new Error('Web correction lacks legacy coverage: ' + char);
  }
  const correctionId = `serif-sc-${correction.sha256.slice(0, 20)}`;
  const correctionBase = {
    bytes: readShard(scDirectory, correction),
    asset: { id: correctionId, file: correctionId + '.woff', family: 'InfiDaoWebSerifSC',
      characters: correction.characters, bytes: correction.bytes, sha256: correction.sha256 },
  };
  const nativeBases = [['serif', metadata.family], ['supplement', metadata.supplementFamily]].map(([name, family]) => {
    const bytes = Buffer.from(require(path.join(root, `miniprogram/assets/fonts/${name}-data.js`)), 'base64');
    if (bytes.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Invalid base WOFF font');
    const sha256 = sha(bytes), id = 'base-' + name + '-' + sha256.slice(0, 20);
    return { bytes, asset: { id, file: id + '.woff', family, bytes: bytes.length, sha256 } };
  });
  const bases = [correctionBase, ...nativeBases];
  const shards = native.shards.map(shard => {
    const bytes = readShard(path.join(root, 'public/flow-fonts'), shard);
    const characters = Array.from(shard.characters).filter(char => !corrected.has(char)).join('');
    return { bytes, asset: { ...shard, characters } };
  }).filter(({ asset }) => asset.characters);
  // Promote the reviewed shard characters into the base so DOM and Canvas
  // both select the correction before the original faces.
  const baseCharacters = Array.from(new Set(metadata.characters + correction.characters)).join('');
  const content = { ...native, originalVersion: native.version, baseCharacters,
    baseFonts: bases.map(item => item.asset), shards: shards.map(item => item.asset) };
  const manifest = { ...content, version: sha(JSON.stringify(content)).slice(0, 20) };
  return { manifest, manifestBytes: Buffer.from(JSON.stringify(manifest) + '\n'), assets: [...bases, ...shards] };
}

function readShard(directory, shard) {
  if (!/^[a-z0-9_-]+\.woff$/.test(shard.file)) throw new Error('Invalid font shard name');
  const bytes = fs.readFileSync(path.join(directory, shard.file));
  if (bytes.length !== shard.bytes || sha(bytes) !== shard.sha256) throw new Error('Font shard integrity failed: ' + shard.file);
  return bytes;
}

module.exports = { createWebFontRelease };
