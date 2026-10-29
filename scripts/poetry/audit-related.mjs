import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { unpackJSON } = require('../../shared/content/codec.cjs');
const { similarOriginal } = require('../../shared/content/text.cjs');
const catalog = JSON.parse(readFileSync('data/content-packs/manifest.json'));
const manifest = JSON.parse(readFileSync('data/' + catalog.poetryManifests[0]));
const works = [];
for (const shard of manifest.shards) {
  const db = new DatabaseSync('data/' + shard.path, { readOnly: true });
  works.push(...db.prepare('SELECT json FROM works ORDER BY id').all().map(row => unpackJSON(row.json)));
  db.close();
}
const pairs = [];
for (let i = 0; i < works.length; i++) for (let j = i + 1; j < works.length; j++) {
  const a = works[i], b = works[j];
  if (similarOriginal(a.text, b.text)) pairs.push({ works: [a, b].map(work => ({ id: work.id, revision: work.revision, title: work.title, author: work.author })), relation: 'similar-text-unverified' });
}
const report = { pack: manifest.version, policy: '机械近文线索，仅用于召回多样性；原文、作者与作品身份分别保留，不据此核定归属或思想传承。', pairs };
writeFileSync('data/poetry/related-texts.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ pack: manifest.version, works: works.length, pairs: pairs.length }));
