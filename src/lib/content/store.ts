import path from 'node:path';
import type { PassageRecord } from '@/types';
import { contentCatalog, contentRoot, readPoetryManifest, verifyPoetryFiles } from './registry';
import { openContentDatabase, type ContentDatabase } from './sqlite';
import type { PoetryManifest, PoetryWork } from './contracts';

const { normalize, pairs, queryTokens, vector, topics, similarOriginal, concreteTask } = require('../../../shared/content/text.cjs') as {
  normalize: (s: string) => string; pairs: (s: string) => string[]; queryTokens: (s: string) => string[]; vector: (s: string) => Float32Array; topics: (s: string) => string[]; similarOriginal: (a: string, b: string) => boolean; concreteTask: (s: string) => boolean;
};
const connections = new Map<string, ContentDatabase>();
const { unpackJSON, decode } = require('../../../shared/content/codec.cjs') as { unpackJSON: (data: Uint8Array) => unknown; decode: (data: Uint8Array) => Uint8Array };
function database(manifest: PoetryManifest, index: number) {
  const shard = manifest.shards[index];
  if (!shard) throw new Error('Unknown shard');
  const file = path.join(contentRoot(), shard.path);
  let db = connections.get(file);
  if (!db) {
    while (connections.size >= 16) { const first = connections.keys().next().value!; connections.get(first)!.close(); connections.delete(first); }
    db = openContentDatabase(file);
    if (db.prepare("SELECT value FROM meta WHERE key='format'").get()?.value !== 'poetry-ngram-v2:64:deflate-1') { db.close(); throw new Error('Content index is incompatible'); }
    connections.set(file, db);
  }
  return db;
}
export function resetContentStore() { for (const db of connections.values()) db.close(); connections.clear(); }
export async function activePoetryManifest() {
  const catalog = await contentCatalog();
  const manifest = await readPoetryManifest(catalog.poetryManifests[0]!);
  await verifyPoetryFiles(manifest);
  // Compatibility belongs to scope resolution, before optional candidates can
  // turn a core request into a runtime failure.
  for (let i=0;i<manifest.shards.length;i++) database(manifest,i);
  return manifest;
}
export async function poetryWork(id: string, revision?: string): Promise<PoetryWork | null> {
  if (!/^[a-f0-9]{32}$/.test(id) || (revision && !/^[a-f0-9]{24}$/.test(revision))) return null;
  const catalog = await contentCatalog();
  for (const file of catalog.poetryManifests) {
    try {
      const manifest = await readPoetryManifest(file);
      await verifyPoetryFiles(manifest);
      const db = database(manifest, parseInt(id[0]!, 16));
      const row = db.prepare('SELECT json FROM works WHERE id=?' + (revision ? ' AND revision=?' : '')).get(...(revision ? [id, revision] : [id]));
      if (row?.json) return unpackJSON(row.json as Uint8Array) as PoetryWork;
    } catch { /* A withdrawn current package must not hide a valid archived revision. */ }
  }
  return null;
}
export async function poetryPassage(id: string, revision?: string): Promise<PassageRecord | undefined> {
  const match = /^poetry-([a-f0-9]{32})-[a-f0-9]+$/.exec(id);
  if (!match) return undefined;
  const work = await poetryWork(match[1]!, revision);
  if (!work || !work.passages.some(p => p.id === id)) return undefined;
  const catalog = await contentCatalog();
  for (const file of catalog.poetryManifests) {
    try {
      const manifest = await readPoetryManifest(file);
      await verifyPoetryFiles(manifest);
      const row = database(manifest, parseInt(work.id[0]!, 16)).prepare('SELECT json FROM passages WHERE id=?').get(id);
      if (row?.json) { const passage = unpackJSON(row.json as Uint8Array) as PassageRecord; if (passage.work?.revision === work.revision) return passage; }
    } catch { /* Continue only through independently verified archives. */ }
  }
  return undefined;
}
export interface PoetryCandidate { passage: PassageRecord; score: number; matchedTerms: string[] }
export async function searchPoetry(query: string, limit = 20): Promise<PoetryCandidate[]> {
  // Seasonal or travel words do not turn a concrete operational question into
  // a poetry request. Explicit requests for poetic expression remain valid.
  if (concreteTask(query)) return [];
  const manifest = await activePoetryManifest();
  const terms = queryTokens(query);
  if (!terms.length) return [];
  const match = terms.map(t => '"' + t.replace(/"/g, '""') + '"').join(' OR ');
  const preciseMatch = pairs(query).slice(0,24).map(t => '"' + t.replace(/"/g,'""') + '"').join(' AND ');
  const qVector = vector(query), intent = topics(query);
  const compact = (text: string) => normalize(text).replace(/[^\p{L}\p{N}]/gu,'');
  const compactQuery = compact(query);
  const exactText = (passage: PassageRecord) => compactQuery.length >= 4 && compact(passage.text).includes(compactQuery);
  const exactTitle = (passage: PassageRecord) => compact(passage.workTitle) === compactQuery;
  const exactAuthor = (passage: PassageRecord) => compact(passage.work?.author || '') === compactQuery;
  const candidates: PoetryCandidate[] = [];
  for (let i = 0; i < manifest.shards.length; i++) {
    const db = database(manifest, i);
    const rows = db.prepare('SELECT p.json,p.vector FROM search JOIN passages p ON p.rowid=search.rowid WHERE search MATCH ? ORDER BY bm25(search,8.0,5.0,1.0,2.0) LIMIT ?').all(match, Math.max(4, Math.min(12, limit)));
    // A long literal quotation must survive broad topic matches before ranking.
    if (preciseMatch) rows.push(...db.prepare('SELECT p.json,p.vector FROM search JOIN passages p ON p.rowid=search.rowid WHERE search MATCH ? ORDER BY bm25(search) LIMIT 3').all(preciseMatch));
    const seen = new Set<string>();
    for (const row of rows) {
      const passage = unpackJSON(row.json as Uint8Array) as PassageRecord;
      if (seen.has(passage.id)) continue;
      seen.add(passage.id);
      const haystack = normalize(passage.source + passage.chapter + passage.text);
      const imagery = passage.imagery || topics(haystack);
      const matchedTerms = terms.filter(t => haystack.includes(t) || imagery.includes(t));
      const coverage = matchedTerms.length / Math.max(1, terms.length);
      const bytes = decode(row.vector as Uint8Array);
      if (!bytes || bytes.byteLength !== 256) throw new Error('Content embedding has invalid dimensions');
      const embedding = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      let similarity = 0; for (let j = 0; j < 64; j++) similarity += qVector[j]! * embedding[j]!;
      const exact = compactQuery.includes(compact(passage.workTitle)) || exactText(passage);
      const intentMatches = intent.filter(t => imagery.includes(t)).length;
      const sceneScore = intentMatches ? .45 + .25 * intentMatches / intent.length + .10 / Math.sqrt(imagery.length) + .05 * Math.max(0,similarity) + .05 * Math.min(1,120/passage.text.length) : 0;
      const seasonConflict = intent.includes('春景') && !imagery.includes('春景') && imagery.includes('秋意');
      const score = Math.min(.99, Math.max(sceneScore, .20 + coverage * .45 + Math.max(0, similarity) * .15 + (exact ? .25 : 0))) - (seasonConflict && !exact ? .18 : 0);
      candidates.push({ passage, score, matchedTerms });
    }
  }
  const works = new Map<string, PoetryCandidate>();
  const ranked = candidates.sort((a,b) =>
    Number(exactAuthor(b.passage))-Number(exactAuthor(a.passage)) ||
    Number(exactTitle(b.passage))-Number(exactTitle(a.passage)) || Number(exactText(b.passage))-Number(exactText(a.passage)) || b.score-a.score || a.passage.id.localeCompare(b.passage.id));
  for (const candidate of ranked) {
    if (works.has(candidate.passage.workId) || [...works.values()].some(previous => similarOriginal(previous.passage.text, candidate.passage.text))) continue;
    works.set(candidate.passage.workId, candidate);
    if (works.size >= Math.min(40, limit)) break;
  }
  return [...works.values()].map(candidate => ({...candidate,score:exactAuthor(candidate.passage) || exactTitle(candidate.passage) || exactText(candidate.passage) ? .999 : candidate.score}));
}
