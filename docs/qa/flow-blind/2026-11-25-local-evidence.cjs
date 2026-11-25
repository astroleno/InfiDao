const fs=require('node:fs');
const localRequire=require('node:module').createRequire(process.cwd()+'/package.json');
const {compactCandidates,quotationKey,repeatsQuotation}=localRequire('./src/lib/flow/context.ts');
const {findFlowPassage,flowCorpus}=localRequire('./src/lib/flow/candidates.ts');
const {searchPoetry}=localRequire('./src/lib/content/store.ts');
const {scoreGoldGroup}=localRequire('./scripts/run-flow-recall.ts');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const [stabilityPath,contextsPath,reviewPath]=process.argv.slice(2);
const stability=read(stabilityPath), frozen=read(contextsPath), reviews=read(reviewPath);
const sentenceCache=new Map();
function support(passage,terms,previousQuotes,window) {
  if (!sentenceCache.has(passage.id)) {
    sentenceCache.set(passage.id,[...passage.text.matchAll(/[^。！？!?\r\n]+[。！？!?]*/gu)].map(match=>({
      start:match.index,end:match.index+match[0].length,quote:match[0],key:quotationKey(match[0]),
    })));
  }
  return sentenceCache.get(passage.id).filter(sentence=>(!window||sentence.start>=window.start&&sentence.end<=window.end) &&
    terms.some(term=>sentence.key.includes(term))&&!repeatsQuotation(sentence.quote,previousQuotes))
    .map(sentence=>({...sentence,terms:terms.filter(term=>sentence.key.includes(term))}));
}
(async()=>{
  const core=await flowCorpus(), byId=new Map(core.map(p=>[p.id,p])), samples=[];
  for (const item of stability.cases) {
    const context=frozen.cases.find(c=>c.id===item.id);
    for (const run of item.runs) {
      if(run.status!=='ok') continue;
      const previous=context.recall.previousQuotes, scope=run.recall.scope;
      if(scope.fingerprint!==context.scopeFingerprint) throw Error('Scope mismatch '+item.id);
      const windows=[];
      for(const range of run.recall.compact){
        const passage=byId.get(range.sourceId)||await findFlowPassage(range.sourceId,range.corpusVersion);
        if(!passage||passage.textHash!==range.textHash||passage.corpusVersion!==range.corpusVersion) throw Error('Passage mismatch '+range.sourceId);
        windows.push({range,matches:support(passage,run.echo.novel,previous,range)});
      }
      const covered=[...new Set(windows.flatMap(w=>w.matches.flatMap(m=>m.terms)))], missing=run.echo.novel.filter(t=>!covered.includes(t));
      const echoCount=run.echo.echoed.length;
      const strict=echoCount>=2&&covered.length===0, relaxed=echoCount>=2&&covered.length<=1&&missing.length>0;
      const blind=reviews.sampleWindowReview.find(r=>r.caseId===item.id&&r.repeat===run.repeat)?.verdict??null;
      samples.push({id:item.id,cohort:item.cohort,repeat:run.repeat,echoCount,covered,missing,strict,relaxed,blind,context,run,windows,previous,scope});
    }
  }
  const strict=samples.filter(r=>r.strict).length;
  const trials=[];
  for(const sample of samples.filter(r=>strict?r.strict:r.relaxed)){
    const {id,cohort,repeat,blind,run,context,windows,missing,previous,scope}=sample;
    const terms=[...new Set(run.terms.filter(t=>missing.includes(quotationKey(t))))];
    const seen=new Set([...windows.map(w=>w.range.sourceId),...context.recall.exclude]);
    const poetry=scope.packIds.includes('poetry')?(await searchPoetry(terms.join(' '),32)).map(p=>p.passage):[];
    const exact=passages=>passages.filter(p=>!seen.has(p.id)&&support(p,missing,previous).length);
    const coreExact=exact(core), poetryExact=exact(poetry);
    const found=[...coreExact,...poetryExact].flatMap(p=>{
      const window=compactCandidates([p],terms,undefined,previous).windows[0];
      const matches=window&&support(p,missing,previous,window);
      return matches?.length?[{...window,source:p.source,chapter:p.chapter,text:p.text.slice(window.start,window.end),matches,
        order:Math.min(...matches.flatMap(m=>m.terms.map(t=>missing.indexOf(t)))),
        priorTop40:run.recall.recalled.some(r=>r.sourceId===window.sourceId),
      }]:[];
    }).sort((a,b)=>a.order-b.order||Number(b.priorTop40)-Number(a.priorTop40)||a.sourceId.localeCompare(b.sourceId,'en'));
    const chosen=found[0], last=windows.at(-1), before=windows.map(w=>w.range);
    const after=!chosen?before:before.length<12?[...before,chosen]:last.matches.length?before:[...before.slice(0,-1),chosen];
    const score=rows=>context.recall.gold.map(group=>scoreGoldGroup(group,run.recall.recalled,rows)==='hit12');
    const beforeGold=score(before),afterGold=score(after);
    trials.push({id,cohort,repeat,blind,covered:sample.covered,missing,coreCorpus:core.length,coreExact:coreExact.length,poetryRetrieved:poetry.length,poetryExact:poetryExact.length,exactWindows:found.length,
      candidates:found,inserted:after===before?null:chosen,removed:after!==before&&before.length===after.length?last.range:null,
      beforeGold,afterGold,gained:afterGold.filter((v,i)=>v&&!beforeGold[i]).length,lost:beforeGold.filter((v,i)=>v&&!afterGold[i]).length});
  }
  const summary={samples:samples.length,atLeastTwoEchoes:samples.filter(r=>r.echoCount>=2).length,strict,relaxed:samples.filter(r=>r.relaxed).length,
    policy:strict?'strict':'relaxed',tried:trials.length,inserted:trials.filter(r=>r.inserted).length,gained:trials.reduce((n,r)=>n+r.gained,0),lost:trials.reduce((n,r)=>n+r.lost,0)};
  console.log(JSON.stringify({summary,classified:samples.map(({context,run,windows,previous,scope,...row})=>row),trials},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
