import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { normalize, tokens, topics, vector } = require('../../shared/content/text.cjs');
const { encode, packJSON } = require('../../shared/content/codec.cjs');
const root = process.argv[2];
const target = process.argv[3] || 'data/poetry/v1';
if (!root) throw new Error('Usage: node scripts/poetry/build-corpus.mjs <verified source directory> [output directory]');
if (existsSync(path.join(target,'manifest.json'))) throw new Error('Build into a new immutable version directory.');
const acquisition = JSON.parse(readFileSync(path.join(root, 'acquisition.json'), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const selection = JSON.parse(readFileSync('data/poetry/selection.json','utf8'));
if (selection.commit !== acquisition.commit || selection.entries.length !== selection.works) throw new Error('Selection snapshot differs');
const selected = new Map();
for (const entry of selection.entries) {const key=entry.path+'\0'+entry.record;selected.set(key,[...(selected.get(key)||[]),entry]);}
const identityPath = 'data/poetry/identity-map.json';
const identities = existsSync(identityPath) ? JSON.parse(readFileSync(identityPath,'utf8')) : {};
mkdirSync(target, { recursive: true });
const shards = Array.from({ length: 16 }, (_, i) => {
  const file = `shard-${i.toString(16)}.sqlite`;
  rmSync(path.join(target, file), { force: true });
  const db = new DatabaseSync(path.join(target, file));
  db.exec(`PRAGMA page_size=4096; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA cache_size=-2048;
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE works(id TEXT PRIMARY KEY,revision TEXT NOT NULL,json BLOB NOT NULL);
    CREATE TABLE passages(id TEXT PRIMARY KEY,work_id TEXT NOT NULL,json BLOB NOT NULL,vector BLOB NOT NULL);
    CREATE TABLE origins(work_id TEXT NOT NULL,path TEXT NOT NULL,record INTEGER NOT NULL);
    CREATE VIRTUAL TABLE search USING fts5(title,author,body,tags,content='');
    BEGIN;`);
  db.prepare('INSERT INTO meta VALUES (?,?)').run('format', 'poetry-ngram-v2:64:deflate-1');
  return { file, db, works: 0, passages: 0, work: db.prepare('INSERT INTO works VALUES (?,?,?)'),
    passage: db.prepare('INSERT INTO passages VALUES (?,?,?,?)'), origin: db.prepare('INSERT INTO origins VALUES (?,?,?)'),
    search: db.prepare('INSERT INTO search(rowid,title,author,body,tags) VALUES (?,?,?,?,?)') };
});
const seen = new Map();
const report = { commit: acquisition.commit, selection: selection.edition, selectionHash: sha(JSON.stringify(selection)), sqlite: process.versions.sqlite, inputRecords: 0, works: 0, passages: 0, duplicates: 0, excluded: [], ancillaryFiles: [], files: [], genres: {}, characters: '' };
const characters = new Set();
function metadata(file, record) {
  if (file.startsWith('楚辞/')) return { dynasty: '先秦至汉', genre: '楚辞' };
  if (file.startsWith('元曲/')) return { dynasty: '元', genre: '曲' };
  if (file.startsWith('五代诗词/')) return { dynasty: '晚唐五代', genre: '词' };
  if (file.startsWith('宋词/')) return { dynasty: '宋', genre: '词' };
  if (file.startsWith('纳兰性德/')) return { dynasty: '清', genre: '词' };
  if (file.startsWith('曹操诗集/')) return { dynasty: '汉', genre: '诗' };
  return { dynasty: file.includes('poet.song.') ? '宋' : '唐', genre: record.rhythmic ? '词' : '诗' };
}
function ranges(text) {
  const result = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 420, text.length);
    if (end < text.length) {
      const segment = text.slice(start, end);
      const stop = Math.max(segment.lastIndexOf('\n'), segment.lastIndexOf('。'), segment.lastIndexOf('！'), segment.lastIndexOf('？'));
      if (stop >= 40) end = start + stop + 1;
      if (/[\uDC00-\uDFFF]/u.test(text[end] || '')) end--;
    }
    result.push({ start, end }); start = end;
  }
  return result;
}
for (const source of acquisition.files.filter(f => f.path.endsWith('.json')).sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
  if (!selection.entries.some(entry => entry.path === source.path)) continue;
  // Biographies and modern translations are intentionally not redistributed.
  if (/author|intro|preface/i.test(source.path)) continue;
  if (source.path.endsWith('/表面结构字.json')) { report.ancillaryFiles.push({ path: source.path, reason: 'character-structure-dictionary-not-poetry' }); continue; }
  const bytes = readFileSync(path.join(root, source.path));
  if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== source.gitBlob) throw new Error(`Source snapshot differs: ${source.path}`);
  const rows = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(rows)) throw new Error(`Expected records array: ${source.path}`);
  const counts = { path: source.path, gitBlob: source.gitBlob, records: rows.length };
  report.files.push(counts);
  for (const [index, row] of rows.entries()) {
    const selectionEntries = selected.get(source.path+'\0'+index);
    if (!selectionEntries) continue;
    report.inputRecords++;
    for (const selectionEntry of selectionEntries) {
    const lines = row.paragraphs || row.content || row.para;
    const sourceTitle = String(row.title || row.rhythmic || '').trim();
    const sourceAuthor = String(row.author || (source.path.startsWith('曹操诗集/') ? '曹操' : '作者不详')).trim();
    const collectionTitle = sourceAuthor.match(/《([^》]+)》/)?.[1];
    const title = selectionEntry.sourceRange ? selectionEntry.title : collectionTitle ? `${collectionTitle} · ${sourceTitle}` : sourceTitle;
    const author = sourceAuthor.replace(/《[^》]*》/g,'').trim() || '作者不详';
    if (!title || !Array.isArray(lines) || !lines.length || !lines.every(line => typeof line === 'string')) {
      report.excluded.push({ path: source.path, record: index, reason: 'missing-title-or-source-lines' }); continue;
    }
    const fullSource = lines.map(line => line.replace(/\r\n?/g, '\n').trim()).join('\n').trim();
    const text = selectionEntry.sourceRange ? fullSource.slice(selectionEntry.sourceRange.start,selectionEntry.sourceRange.end) : fullSource;
    if (selectionEntry.fullSourceHash && sha(fullSource)!==selectionEntry.fullSourceHash) throw new Error('Source group differs');
    if (sha(text) !== selectionEntry.textHash || source.gitBlob !== selectionEntry.gitBlob) throw new Error('Selected original differs');
    if (!text || /[\uE000-\uF8FF\uFFFD]/u.test(text)) {
      report.excluded.push({ path: source.path, record: index, reason: text ? 'unresolved-source-character' : 'empty-source' }); continue;
    }
    const duplicateKey = sha(normalize(author) + '\0' + text.replace(/\s/g, ''));
    const previousKey = sha(normalize(sourceAuthor) + '\0' + text.replace(/\s/g,''));
    const previous = seen.get(duplicateKey);
    if (previous) {
      const shard = shards[parseInt(previous[0], 16)];
      shard.origin.run(previous, source.path, index); report.duplicates++; continue;
    }
    const id = identities[duplicateKey] || identities[previousKey] || sha(row.id ? 'upstream:' + row.id : source.path.split('/')[0] + '\0' + sourceAuthor + '\0' + sourceTitle + '\0' + text).slice(0, 32);
    identities[duplicateKey] = id;
    const meta = metadata(source.path,row);
    const revision = sha(JSON.stringify({title,author,...meta,text,rhythmic:row.rhythmic || '',section:row.section || ''})).slice(0, 24), shard = shards[parseInt(id[0], 16)];
    const work = { id, revision, title, author, ...meta, text, rhythmic:row.rhythmic || null, section:row.section || null,
      lines: [0,...text.matchAll(/\n/g)].map(match => typeof match === 'number' ? match : match.index + 1), sourcePath: source.path, sourceIndex: index,
      upstreamId: typeof row.id === 'string' ? row.id : null,
      ...(selectionEntry.sourceRange ? {sourceRange:selectionEntry.sourceRange,sourceTitle} : {}),
      attribution: author === '作者不详' || author === '无名氏' ? 'unknown' : 'as-recorded',
      sourceUrl: `https://github.com/${acquisition.repository}/blob/${acquisition.commit}/${source.path.split('/').map(encodeURIComponent).join('/')}`,
      passages: [] };
    for (const range of ranges(text)) {
      const value = text.slice(range.start, range.end);
      const passageId = `poetry-${id}-${range.start.toString(16)}`;
      const textHash = sha(value);
      work.passages.push({ id: passageId, ...range, textHash });
      const tags = [...new Set([...topics(value + title),...topics((row.tags || []).join(' '))])];
      const passage = { id: passageId, source: title, collection: 'poetry', workId: id, workTitle: title,
        chapter: `${work.dynasty} · ${author}`, section: work.passages.length, text: value, textHash, imagery: tags,
        corpusVersion: `poetry:${revision}`, work: { packId: 'poetry', workId: id, revision, ...range, title, author, dynasty: work.dynasty, genre: work.genre } };
      const embedding = vector(title + author + value + tags.join(' '));
      const inserted = shard.passage.run(passageId, id, packJSON(passage), encode(Buffer.from(embedding.buffer)));
      shard.search.run(inserted.lastInsertRowid, tokens(title), tokens(author), tokens(value), tokens(tags.join(' ')));
      shard.passages++; report.passages++;
    }
    shard.work.run(id, revision, packJSON(work)); shard.origin.run(id, source.path, index);
    shard.works++; report.works++; seen.set(duplicateKey, id);
    report.genres[work.genre] = (report.genres[work.genre] || 0) + 1;
    for (const c of text + title + author) if (!/\s/u.test(c)) characters.add(c);
    if (report.works % 25000 === 0) console.log(`${report.works} works / ${report.passages} passages indexed`);
    }
  }
}
if (report.works !== selection.works || report.excluded.length || report.duplicates) throw new Error('Selected anthology inventory differs');
const files = shards.map(shard => {
  shard.db.exec("INSERT INTO search(search) VALUES ('optimize'); COMMIT; VACUUM;");
  shard.db.close();
  const file = path.join(target, shard.file);
  return { path: path.relative('data', file).split(path.sep).join('/'), sha256: sha(readFileSync(file)), bytes: statSync(file).size, works: shard.works, passages: shard.passages };
});
report.characters = [...characters].sort().join('');
writeFileSync(path.join(target, 'quality.json'), JSON.stringify(report) + '\n');
writeFileSync(path.join(target, 'LICENSE'), readFileSync(path.join(root, 'LICENSE')));
const version = 'poetry-' + sha(JSON.stringify(files)).slice(0, 16);
const manifest = { schemaVersion: 1, packId: 'poetry', version, indexModel: 'poetry-ngram-v2', dimension: 64,
  repository: acquisition.repository, commit: acquisition.commit, license: 'MIT', works: report.works, passages: report.passages, shards: files };
writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(identityPath+'.tmp',JSON.stringify(identities)+'\n'); renameSync(identityPath+'.tmp',identityPath);
console.log(JSON.stringify({ ...manifest, shards: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), excluded: report.excluded.length, duplicates: report.duplicates }));
