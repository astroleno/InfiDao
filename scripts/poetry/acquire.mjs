import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sources = JSON.parse(await readFile('data/poetry/sources.json', 'utf8'));
const checkout = process.argv[2];
const output = process.argv[3];
if (!checkout || !output) throw new Error('Usage: node scripts/poetry/acquire.mjs <upstream git directory> <output directory>');
const tree = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-tree', '-r', sources.commit, '--', ...sources.directories, 'LICENSE', 'README.md'], { cwd: checkout, encoding: 'utf8', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } });
const files = tree.trim().split('\n').flatMap(line => {
  const [entry, file] = line.split('\t');
  if (!file || /\/error\/|\/rank\/|authors|intro|preface|\.300\./i.test(file)) return [];
  if (!/\.json$|README\.md$|LICENSE$/.test(file)) return [];
  return [{ path: file, gitBlob: entry.split(' ')[2] }];
});
await mkdir(output, { recursive: true });
let completed = 0;
async function obtain(file) {
  const dest = path.join(output, file.path);
  await mkdir(path.dirname(dest), { recursive: true });
  const valid = async () => {
    try {
      const bytes = await readFile(dest);
      return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === file.gitBlob;
    } catch { return false; }
  };
  if (!await valid()) {
    const url = `https://raw.githubusercontent.com/${sources.repository}/${sources.commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    await new Promise((resolve, reject) => {
      const child = spawn('curl', ['--fail', '--location', '--retry', '4', '--retry-delay', '1', '--max-time', '120', '--silent', '--show-error', url, '--output', dest], { stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', b => { error += b; });
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file.path}: ${error}`)));
      child.on('error', reject);
    });
    if (!await valid()) throw new Error(`Git blob checksum differs: ${file.path}`);
  }
  completed++;
  if (completed % 25 === 0) console.log(`${completed}/${files.length} source files verified`);
}
let index = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (index < files.length) await obtain(files[index++]); }));
await writeFile(path.join(output, 'acquisition.json'), JSON.stringify({ ...sources, files }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, commit: sources.commit, output }));
