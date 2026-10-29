import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error('Usage: node scripts/poetry/check-rebuild.mjs <verified source directory> [report.json]');
const project = process.cwd();
const catalog = JSON.parse(readFileSync('data/content-packs/manifest.json'));
const manifestPath = path.join('data', catalog.poetryManifests[0]);
const manifest = JSON.parse(readFileSync(manifestPath));
const temporary = mkdtempSync(path.join(tmpdir(), 'infidao-poetry-rebuild-'));
const sha = value => createHash('sha256').update(value).digest('hex');
try {
  mkdirSync(path.join(temporary, 'data/poetry'), { recursive: true });
  for (const file of ['selection.json', 'identity-map.json']) copyFileSync(path.join('data/poetry', file), path.join(temporary, 'data/poetry', file));
  // Reuse the exact runtime: shell-managed Node versions can change with cwd.
  execFileSync(process.execPath, [path.join(project, 'scripts/poetry/build-corpus.mjs'), path.resolve(sourceRoot), path.dirname(manifestPath)], { cwd: temporary, stdio: 'pipe' });
  const rebuilt = JSON.parse(readFileSync(path.join(temporary, manifestPath)));
  const byteIdentical = JSON.stringify(manifest) === JSON.stringify(rebuilt) && manifest.shards.every(shard => sha(readFileSync(path.join(temporary, 'data', shard.path))) === shard.sha256);
  const report = { node: process.version, sqlite: process.versions.sqlite, zlib: process.versions.zlib, pack: manifest.version, shards: manifest.shards.length, byteIdentical };
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!byteIdentical) process.exitCode = 1;
} finally { rmSync(temporary, { recursive: true, force: true }); }
