// Build and deployment both verify the checked-in, content-addressed WOFFs.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function createWebFontRelease(root) {
  const { version, manifestSha256 } = JSON.parse(fs.readFileSync(path.join(root, 'public/flow-fonts/web-tc/release.json'), 'utf8'));
  if (!/^[0-9a-f]{20}$/.test(version)) throw new Error('Invalid Web font release version');
  const directory = path.join(root, 'public/flow-assets', 'v-' + version);
  const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const { version: actualVersion, ...content } = manifest;
  if (actualVersion !== version || sha(manifestBytes) !== manifestSha256 ||
      sha(JSON.stringify(content)).slice(0, 20) !== version) throw new Error('Web font manifest integrity failed');
  const assets = [...manifest.baseFonts, ...manifest.shards].map(asset => ({
    asset, bytes: readAsset(directory, asset, /^[a-z0-9-]+\.woff$/),
  }));
  const licenses = manifest.licenses.map(asset => ({
    asset, bytes: readAsset(directory, asset, /^[A-Za-z0-9-]+\.txt$/),
  }));
  return { manifest, manifestBytes, assets, licenses };
}

function readAsset(directory, asset, filename) {
  if (!filename.test(asset.file)) throw new Error('Invalid font asset name');
  const bytes = fs.readFileSync(path.join(directory, asset.file));
  if (bytes.length !== asset.bytes || sha(bytes) !== asset.sha256) throw new Error('Font asset integrity failed: ' + asset.file);
  return bytes;
}

module.exports = { createWebFontRelease };
