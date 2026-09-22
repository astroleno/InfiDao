const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
for (const file of walk(root)) {
  if (/\.(js|cjs)$/.test(file)) cp.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (/\.json$/.test(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const page of config.pages) {
  for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(path.join(root, page + extension))) throw new Error('Missing page file: ' + page + extension);
  }
}
console.log('JavaScript syntax, JSON, and native page structure verified.');
