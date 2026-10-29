import fs from 'node:fs';
import { searchPoetry } from '../../src/lib/content/store';
import { searchPassages } from '../../src/lib/search/service';
const {normalize}=require('../../shared/content/text.cjs') as {normalize:(s:string)=>string};
async function main(){
  globalThis.fetch=async()=>{throw new Error('Network disabled during local retrieval regression');};
  const fixture=JSON.parse(fs.readFileSync('tests/fixtures/poetry-search-regression-v1.json','utf8'));
  const cases=[];
  for(const item of fixture.poetry){const rows=await searchPoetry(item.query,10);const passed=rows.slice(0,5).some(row=>item.expectedTitle?normalize(row.passage.source)===normalize(item.expectedTitle):normalize(row.passage.work?.author||'')===normalize(item.expectedAuthor));cases.push({...item,passed,top:rows.slice(0,5).map(row=>({id:row.passage.id,title:row.passage.source,author:row.passage.work?.author}))});}
  for(const item of fixture.core){const before=await searchPassages({query:item.query});const both=await searchPassages({query:item.query,contentPacks:['core','poetry']});const after=await searchPassages({query:item.query});cases.push({...item,passed:both[0]?.id===item.expectedId&&JSON.stringify(before)===JSON.stringify(after),top:both.map(row=>row.id)});}
  const visibleCases=['v2','v3','v4'].flatMap(version=>JSON.parse(fs.readFileSync(`tests/fixtures/poetry-search-regression-${version}.json`,'utf8')).cases);
  const compact=(text:string)=>normalize(text).replace(/[^\p{L}\p{N}]/gu,'');
  for(const item of visibleCases){
    const poetry=await searchPoetry(item.query,10),combined=await searchPassages({query:item.query,contentPacks:['core','poetry']});
    const supports=(text:string)=>item.anyText.some((quote:string)=>compact(text).includes(compact(quote)));
    cases.push({...item,passed:item.empty?poetry.length===0&&combined.length===0:item.expectedTitle?poetry.slice(0,3).some(row=>compact(row.passage.source)===compact(item.expectedTitle))&&combined.slice(0,3).some(row=>compact(row.source)===compact(item.expectedTitle)):poetry.slice(0,5).some(row=>supports(row.passage.text))&&combined.slice(0,5).some(row=>supports(row.text)),poetryTop:poetry.slice(0,5).map(row=>row.passage.source),combinedTop:combined.slice(0,5).map(row=>row.source)});
  }
  const result={kind:'visible-regression',passed:cases.every(row=>row.passed),cases};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}
void main();
