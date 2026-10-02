#!/usr/bin/env node
// Freeze the reviewed worktree and its immutable font payload for a Linux origin build.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directories = ['data', 'miniprogram', 'public', 'scripts', 'shared', 'src', 'tests'];
const files = [
  '.dockerignore', '.eslintrc.json', 'Dockerfile', 'docker-compose.yml', 'next-env.d.ts',
  'next.config.js', 'nginx.conf', 'package.json', 'package-lock.json', 'postcss.config.js',
  'tailwind.config.ts', 'tsconfig.json', 'tsconfig.scripts.json',
];
const excluded = new Set(['miniprogram/project.private.config.json']);
const immutable = 'public, max-age=31536000, immutable';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`git ${args[0]} failed`);
  return result.stdout.trim();
}

function options(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--output', '--source-ref', '--cdn-host', '--object-root'].includes(argv[i]) || !argv[i + 1]) {
      fail('usage: package-release.mjs --output <directory> [--source-ref HEAD] [--cdn-host assets.aitoshuu.me] [--object-root releases/aitoshuu-me]');
    }
    parsed[argv[i].slice(2)] = argv[i + 1];
  }
  if (!parsed.output) fail('--output is required');
  parsed['cdn-host'] ||= 'assets.aitoshuu.me';
  parsed['object-root'] ||= 'releases/aitoshuu-me';
  if (!/^[a-z0-9.-]+$/i.test(parsed['cdn-host']) || !/^[a-z0-9/-]+$/i.test(parsed['object-root']) ||
      parsed['object-root'].split('/').some(part => !part || part === '.' || part === '..')) {
    fail('invalid CDN host or object root');
  }
  return parsed;
}

async function walk(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) fail('release input contains a symlink');
  if (info.isFile()) return [target];
  if (!info.isDirectory()) fail('release input is not a regular file or directory');
  const names = (await readdir(target)).filter(name => name !== '.DS_Store').sort();
  return (await Promise.all(names.map(name => walk(join(target, name))))).flat();
}

async function normalizeArchiveTimes(target) {
  const info = await lstat(target);
  if (info.isDirectory()) {
    for (const name of (await readdir(target)).sort()) await normalizeArchiveTimes(join(target, name));
  }
  await utimes(target, 0, 0);
}

async function main() {
  const args = options(process.argv.slice(2));
  const output = resolve(args.output);
  if (output === root || output.startsWith(root + sep)) fail('release output must be outside the source tree');
  const head = git('rev-parse', 'HEAD');
  if (args['source-ref']) {
    if (git('rev-parse', `${args['source-ref']}^{commit}`) !== head) fail('--source-ref must be the checked-out HEAD');
    if (git('status', '--porcelain', '--untracked-files=all', '--', ...directories, ...files)) {
      fail('--source-ref requires clean release inputs');
    }
  }
  const relativeFiles = (await Promise.all([...directories, ...files].map(name => walk(join(root, name)))))
    .flat().map(path => relative(root, path).split(sep).join('/'))
    .filter(path => !excluded.has(path))
    .sort();
  if (relativeFiles.some(path => /(^|\/)(?:\.env[^/]*|project\.private\.config\.json|node_modules|\.git)(?:\/|$)/.test(path) ||
      /\.(?:key|pem|p12)$/i.test(path))) fail('release input contains a private file');
  await mkdir(output);
  const source = join(output, 'source');
  await mkdir(source);
  const sourceHash = createHash('sha256');
  for (const path of relativeFiles) {
    const bytes = await readFile(join(root, path));
    sourceHash.update(path).update('\0').update(bytes).update('\0');
    const dest = join(source, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
  const sourceDigest = sourceHash.digest('hex');
  const releaseId = `infidao-${sourceDigest.slice(0, 16)}`;
  const { createWebFontRelease } = createRequire(import.meta.url)('../scripts/web-flow-font-assets.cjs');
  const { manifest: fontManifest, manifestBytes, assets } = createWebFontRelease(source);
  if (!/^[a-zA-Z0-9_-]{10,64}$/.test(fontManifest.version) || !Array.isArray(fontManifest.shards)) {
    fail('invalid font manifest');
  }
  const versionPath = `flow-assets/v-${fontManifest.version}`;
  const objectPrefix = `${args['object-root']}/${releaseId}/`;
  const cdnBase = `https://${args['cdn-host']}/${objectPrefix}${versionPath}`;
  const entries = [];
  for (const { file: filename, bytes, asset } of [
    { file: 'manifest.json', bytes: manifestBytes },
    ...assets.map(item => ({ file: item.asset.file, bytes: item.bytes, asset: item.asset })),
  ]) {
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) fail('invalid font filename');
    const generated = join(source, 'public', versionPath, filename);
    if (sha(bytes) !== sha(await readFile(generated))) fail('generated font differs from source');
    if (asset && (asset.bytes !== bytes.length || asset.sha256 !== sha(bytes))) fail('font asset hash mismatch');
    const packagePath = `cdn/${versionPath}/${filename}`;
    const target = join(output, packagePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(generated, target);
    entries.push({
      channel: 'fonts', packagePath, objectKey: `${objectPrefix}${versionPath}/${filename}`,
      bytes: bytes.length, sha256: sha(bytes), mime: filename.endsWith('.woff') ? 'font/woff' : 'application/json; charset=utf-8',
      cacheControl: immutable,
    });
  }
  const tarPath = join(output, 'origin-source.tar.gz');
  await normalizeArchiveTimes(source);
  const archive = spawnSync('tar', ['--no-xattrs', '--format=ustar', '-C', source, '-czf', tarPath, '.'], {
    encoding: 'utf8', env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (archive.status !== 0) fail('source archive failed');
  const archiveBytes = await readFile(tarPath);
  if (!(await stat(tarPath)).size || archiveBytes.length === 0) fail('empty source archive');
  const manifest = {
    schemaVersion: 1, site: 'InfiDao', releaseId, gitHead: head,
    sourceMode: args['source-ref'] ? 'commit' : 'worktree', sourceDigest,
    sourceFiles: relativeFiles.length, sourceArchive: {
      packagePath: 'origin-source.tar.gz', bytes: archiveBytes.length, sha256: sha(archiveBytes),
    },
    cdnBase, objectPrefix, fontVersion: fontManifest.version,
    entries: entries.sort((a, b) => a.packagePath.localeCompare(b.packagePath)),
  };
  await mkdir(join(output, 'manifests'));
  await writeFile(join(output, 'manifests/release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output, releaseId, sourceMode: manifest.sourceMode,
    sourceFiles: relativeFiles.length, sourceBytes: archiveBytes.length,
    cdnObjects: entries.length, cdnBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
