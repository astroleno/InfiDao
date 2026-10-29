import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require=createRequire(import.meta.url);
const {unpackJSON,decode}=require('../../shared/content/codec.cjs');
const sourceRoot=process.argv[2];
if(!sourceRoot)throw new Error('Usage: node scripts/poetry/validate.mjs <verified source directory> [report.json]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalog=JSON.parse(readFileSync('data/content-packs/manifest.json'));
const manifest=JSON.parse(readFileSync(path.join('data',catalog.poetryManifests[0])));
const selection=JSON.parse(readFileSync('data/poetry/selection.json'));
const selected=new Map(selection.entries.map(entry=>[entry.path+'\0'+entry.record+'\0'+entry.textHash,entry]));
const sources=new Map(),characters=new Set(),ids=new Set();
let works=0,passages=0,origins=0;
const assert=(value,message)=>{if(!value)throw new Error(message);};
for(const shard of manifest.shards){
  const file=path.join('data',shard.path),bytes=readFileSync(file);
  assert(bytes.length===shard.bytes&&sha(bytes)===shard.sha256,'Artifact checksum: '+file);
  const db=new DatabaseSync(file,{readOnly:true});
  assert(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','SQLite integrity');
  assert(db.prepare("SELECT value FROM meta WHERE key='format'").get().value==='poetry-ngram-v2:64:deflate-1','Index format');
  for(const row of db.prepare('SELECT json FROM works ORDER BY id').all()){
    const work=unpackJSON(row.json),entry=selected.get(work.sourcePath+'\0'+work.sourceIndex+'\0'+sha(work.text));
    assert(entry&&!ids.has(work.id)&&/^[0-9a-f]{32}$/.test(work.id),'Work identity');ids.add(work.id);
    let rows=sources.get(work.sourcePath);
    if(!rows){const raw=readFileSync(path.join(sourceRoot,work.sourcePath));assert(createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex')===entry.gitBlob,'Upstream Git blob');rows=JSON.parse(raw);sources.set(work.sourcePath,rows);}
    const original=rows[work.sourceIndex],full=(original.paragraphs||original.content||original.para).map(s=>s.replace(/\r\n?/g,'\n').trim()).join('\n').trim();
    const text=entry.sourceRange?full.slice(entry.sourceRange.start,entry.sourceRange.end):full;
    assert(!entry.fullSourceHash||sha(full)===entry.fullSourceHash,'Source collection hash');
    assert(work.text===text&&sha(text)===entry.textHash,'Canonical original');
    const revision=sha(JSON.stringify({title:work.title,author:work.author,dynasty:work.dynasty,genre:work.genre,text:work.text,rhythmic:work.rhythmic||'',section:work.section||''})).slice(0,24);
    assert(revision===work.revision,'Work revision');
    assert(JSON.stringify(work.lines)===JSON.stringify([0,...Array.from(text.matchAll(/\n/g),m=>m.index+1)]),'Line starts');
    let cursor=0;
    for(const range of work.passages){
      assert(range.start===cursor&&range.end>range.start&&range.end<=text.length&&range.end-range.start<=420,'Complete contiguous source ranges');
      assert(!/[\uDC00-\uDFFF]/u.test(text[range.start])&&!/[\uD800-\uDBFF]/u.test(text[range.end-1]),'Surrogate boundary');
      const row=db.prepare('SELECT json,vector FROM passages WHERE id=?').get(range.id),passage=row&&unpackJSON(row.json);
      assert(passage?.text===text.slice(range.start,range.end)&&passage.textHash===sha(passage.text)&&range.textHash===passage.textHash,'Passage original/hash');
      assert(passage.work.workId===work.id&&passage.work.revision===revision&&passage.work.start===range.start&&passage.work.end===range.end&&passage.corpusVersion==='poetry:'+revision,'Canonical passage reference');
      const vectorBytes=decode(row.vector);assert(vectorBytes.byteLength===256,'Embedding dimensions');
      const vector=new Float32Array(vectorBytes.buffer.slice(vectorBytes.byteOffset,vectorBytes.byteOffset+vectorBytes.byteLength));assert([...vector].every(Number.isFinite)&&Math.abs(Math.hypot(...vector)-1)<.0001,'Embedding values');
      cursor=range.end;passages++;
    }
    assert(cursor===text.length,'Full work coverage');
    for(const c of text+work.title+work.author)if(!/\s/u.test(c))characters.add(c);
    origins+=db.prepare('SELECT count(*) AS count FROM origins WHERE work_id=?').get(work.id).count;
    works++;
  }
  assert(db.prepare('SELECT count(*) AS count FROM search').get().count===shard.passages,'FTS coverage');
  db.close();
}
assert(works===1000&&works===manifest.works&&passages===manifest.passages&&origins===1000,'Selected inventory');
const runtime=require('../../miniprogram/flow/glyph-outline');
const fonts=JSON.parse(readFileSync('public/flow-fonts/manifest.json'));
for(const font of fonts.shards){const bytes=readFileSync(path.join('public/flow-fonts',font.file));assert(bytes.length===font.bytes&&sha(bytes)===font.sha256,'Font checksum');runtime.installFont(font.id,font.characters,new Uint8Array(bytes).buffer);}
for(const character of characters){const glyph=runtime.glyphOutline(character);assert(glyph.commands.length>0,'Visible glyph: '+character);}
const report={pack:manifest.version,works,passages,origins,sourceFiles:sources.size,characters:characters.size,verifiedGlyphs:characters.size,sourceAndRangeCoverage:1,artifactBytes:manifest.shards.reduce((n,s)=>n+s.bytes,0),sqlite:process.versions.sqlite,node:process.version};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
