#!/usr/bin/env node
// Assemble Next's traced server with the complete public and private runtime data.
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { precompress } from './precompress-static.mjs';

function args(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!['--source', '--destination', '--release-id'].includes(argv[index]) || !argv[index + 1]) {
      throw new Error('usage: assemble-standalone.mjs --source <built source> --destination <new app directory> --release-id <id>');
    }
    values[argv[index].slice(2)] = argv[index + 1];
  }
  if (!values.source || !values.destination || !/^infidao-[0-9a-f]{16}$/.test(values['release-id'] || '')) {
    throw new Error('source, destination, and release id are required');
  }
  return values;
}

async function overlay(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(destination, entry.name);
    if (entry.isDirectory()) await overlay(from, to);
    else if (entry.isFile()) await cp(from, to, { force: true });
    else throw new Error(`unexpected runtime asset: ${from}`);
  }
}

async function checkedFile(root, relative) {
  if (!relative.startsWith('data/') || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('invalid corpus manifest path');
  }
  const path = join(root, relative);
  if (!(await stat(path)).isFile()) throw new Error(`missing corpus file: ${relative}`);
}

async function main() {
  const options = args(process.argv.slice(2));
  const source = resolve(options.source), destination = resolve(options.destination);
  if (destination === source || destination.startsWith(source + sep) || source.startsWith(destination + sep)) {
    throw new Error('source and destination must be separate');
  }
  try { await lstat(destination); throw new Error('destination already exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const standalone = join(source, '.next/standalone');
  if (!(await stat(join(standalone, 'server.js'))).isFile()) throw new Error('standalone server missing');
  await mkdir(dirname(destination), { recursive: true });
  await cp(standalone, destination, { recursive: true, errorOnExist: true, force: false });
  await overlay(join(source, '.next/static'), join(destination, '.next/static'));
  await precompress(join(destination, '.next/static'));
  await overlay(join(source, 'public'), join(destination, 'public'));
  await overlay(join(source, 'data'), join(destination, 'data'));
  await mkdir(join(destination, '.next/cache'), { recursive: true });

  const chunks = await readdir(join(destination, '.next/static/chunks'));
  if (!chunks.some(name => name.endsWith('.js')) ||
      (await lstat(join(destination, '.next/static/static')).then(() => true, () => false)) ||
      (await lstat(join(destination, 'data/data')).then(() => true, () => false))) {
    throw new Error('runtime assets have an extra directory layer or missing JavaScript chunks');
  }
  const corpus = JSON.parse(await readFile(join(destination, 'data/corpus-manifest.json'), 'utf8'));
  if (!Array.isArray(corpus.files) || !corpus.files.length) throw new Error('corpus manifest is empty');
  for (const file of corpus.files) await checkedFile(destination, file.path);
  const release = JSON.parse(await readFile(join(destination, `public/flow-releases/${options['release-id']}.json`), 'utf8'));
  if (release.id !== options['release-id']) throw new Error('runtime release id mismatch');
  const fontPath = `public/flow-assets/v-${release.fontVersion}`;
  const font = JSON.parse(await readFile(join(destination, fontPath, 'manifest.json'), 'utf8'));
  if (font.version !== release.fontVersion || !Array.isArray(font.shards) || !font.shards.length) {
    throw new Error('runtime font manifest mismatch');
  }
  for (const shard of [...(font.baseFonts || []), ...font.shards]) {
    if (!/^[a-z0-9_-]+\.woff$/.test(shard.file)) throw new Error('invalid font shard');
    const bytes = await readFile(join(destination, fontPath, shard.file));
    if (bytes.length !== shard.bytes || createHash('sha256').update(bytes).digest('hex') !== shard.sha256) {
      throw new Error(`runtime font shard mismatch: ${shard.file}`);
    }
  }
  console.log(JSON.stringify({ releaseId: release.id, corpusFiles: corpus.files.length,
    nextChunks: chunks.filter(name => name.endsWith('.js')).length, fontShards: font.shards.length, baseFonts: (font.baseFonts || []).length,
    destination }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
