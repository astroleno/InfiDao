import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import { activePoetryManifest, searchPoetry, poetryWork } from '../../src/lib/content/store';
import { searchPassages } from '../../src/lib/search/service';

async function main() {
  const started = performance.now();
  const coreQueries = ['如何面对困境','如何处理朋友关系','学习','家庭自主','诗经'];
  const core = [];
  for (const query of coreQueries) { const t = performance.now(); const rows = await searchPassages({query}); core.push({query,ms:performance.now()-t,ids:rows.map(r=>r.id)}); }
  const enable = performance.now(); const manifest = await activePoetryManifest(); const enableMs = performance.now()-enable;
  const queries=['静夜思','李白','明月','想家','离别','秋天','春雨','相思','苏轼','水调歌头','一蓑烟雨任平生','长相思','离骚','屈原','天净沙','关汉卿','山水','闲适','边塞','时光','月'];
  const timings: number[] = [], workTimings: number[] = [], results = [];
  let peakRSS=process.memoryUsage().rss;
  for (const query of queries) {
    let selected;
    for (let repeat=0;repeat<3;repeat++) {
      const t=performance.now(); selected=await searchPoetry(query,10); timings.push(performance.now()-t);
      peakRSS=Math.max(peakRSS,process.memoryUsage().rss);
      const ref=selected[0]?.passage.work;
      if(ref) {const w=performance.now();const work=await poetryWork(ref.workId,ref.revision);workTimings.push(performance.now()-w);if(!work||work.text.slice(ref.start,ref.end)!==selected[0]!.passage.text)throw new Error('Work range differs');}
    }
    results.push({query,top:selected?.slice(0,3).map(r=>({id:r.passage.id,title:r.passage.source,author:r.passage.work?.author,score:r.score}))});
  }
  const p95=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1] || 0;
  const concurrentStarted=performance.now();await Promise.all(queries.slice(0,4).map(query=>searchPoetry(query,10)));const concurrentBatchMs=performance.now()-concurrentStarted;
  peakRSS=Math.max(peakRSS,process.resourceUsage().maxRSS*1024);
  const report={node:process.version,platform:process.platform,pack:manifest.version,works:manifest.works,passages:manifest.passages,enableMs,searchP95:p95(timings),workP95:p95(workTimings),peakRSS,concurrency:4,concurrentBatchMs,maxShardBytes:Math.max(...manifest.shards.map(s=>s.bytes)),totalBytes:manifest.shards.reduce((n,s)=>n+s.bytes,0),core,results,elapsedMs:performance.now()-started};
  if(process.argv[2])await fs.writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.enableMs>8000||report.searchP95>500||report.workP95>100||report.peakRSS>512*1024*1024||report.maxShardBytes>=50*1024*1024||report.totalBytes>=2*1024*1024*1024)process.exitCode=1;
}
void main();
