#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function main() {
  if (!process.argv[2]) throw new Error('usage: verify-cdn-release.mjs <package directory>');
  const root = resolve(process.argv[2]);
  const manifest = JSON.parse(await readFile(join(root, 'manifests/release-manifest.json'), 'utf8'));
  if (manifest.site !== 'InfiDao' || !/^infidao-[0-9a-f]{16}$/.test(manifest.releaseId) ||
      manifest.objectPrefix !== `releases/aitoshuu-me/${manifest.releaseId}/` ||
      manifest.cdnBase !== `https://assets.aitoshuu.me/${manifest.objectPrefix}flow-assets/v-${manifest.fontVersion}`) {
    throw new Error('invalid InfiDao CDN release manifest');
  }
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error('no CDN entries');
  const errors = [];
  for (const entry of manifest.entries) {
    if (entry.channel !== 'fonts' || !entry.objectKey.startsWith(manifest.objectPrefix)) throw new Error('invalid CDN entry');
    try {
      const response = await fetch(`https://assets.aitoshuu.me/${entry.objectKey}`, {
        headers: { Origin: 'https://aitoshuu.me' }, signal: AbortSignal.timeout(30000),
      });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('content hash mismatch');
      const cache = response.headers.get('cache-control') || '';
      if (!cache.includes('immutable') || !cache.includes('max-age=31536000')) throw new Error('cache metadata mismatch');
      if (response.headers.get('content-type') !== entry.mime) throw new Error('content type mismatch');
      const cors = response.headers.get('access-control-allow-origin');
      if (cors !== '*' && cors !== 'https://aitoshuu.me') throw new Error('CORS mismatch');
    } catch (error) {
      errors.push(`${entry.objectKey}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ releaseId: manifest.releaseId, checked: manifest.entries.length,
    bytes: manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0), cors: 'passed', cache: 'passed' }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
