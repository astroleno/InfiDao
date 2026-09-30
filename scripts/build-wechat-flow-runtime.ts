// Copy the platform-neutral flow runtime into the WeChat package boundary.
// The app cannot load source files outside its package at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurated } from './build-flow-curated';

const root = process.cwd();
const source = path.join(root, 'shared/flow');
const target = path.join(root, 'miniprogram/flow/generated/shared');

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith('.js') ? [full] : [];
  });
}

export async function buildFlowRuntime() {
  await buildCurated();
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const sources = files(source);
  for (const file of sources) {
    const relative = path.relative(source, file);
    const output = path.join(target, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(file, output);
  }
  console.log(`Generated ${sources.length} shared flow modules for the WeChat package.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildFlowRuntime().catch(error => { console.error(error); process.exitCode = 1; });
}
