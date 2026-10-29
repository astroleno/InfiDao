/** @jest-environment node */
import { runFlow } from '@/lib/flow/service';
import { flowJson } from '@/lib/flow/model';
import { candidatesFor, flowCorpus } from '@/lib/flow/candidates';
import { resolveContentScope } from '@/lib/content/scope';
import { createSessionStore, MemoryDocumentBackend } from '@/lib/flow/session-store';
import type { FlowChain, FlowEvent, FlowRequest } from '@/lib/flow/contracts';
import type { PassageRecord } from '@/types';
jest.mock('@/lib/flow/model',()=>({flowJson:jest.fn(),flowModelConfig:()=>({model:'test'})}));
jest.mock('@/lib/flow/relations',()=>({reviewRelations:jest.fn(async frames=>frames)}));
jest.mock('@/lib/flow/candidates',()=>({...jest.requireActual('@/lib/flow/candidates'),flowCorpus:jest.fn(),candidatesFor:jest.fn(),planFocus:jest.fn(async()=>({focus:'山月',terms:['山水','明月']}))}));
jest.mock('@/lib/content/scope',()=>({resolveContentScope:jest.fn(async(ids=['core'])=>({packIds:ids,versions:{core:'v1',...(ids.includes('poetry')?{poetry:'v1'}:{})},fingerprint:ids.includes('poetry')?'both':'core',unavailable:[]}))}));
const rows:PassageRecord[]=['山月照故园，清风入梦来。','远山含暮色，归舟向江天。','相知无远近，万里尚为邻。'].map((text,i)=>({id:'s'+i,text,textHash:'h'+i,corpusVersion:'core-v1',source:'诗经',chapter:'诗章',section:i,collection:'core',workId:'shijing',workTitle:'诗经'}));
const generated=(index:number)=>({frames:[{sourceId:rows[index]!.id,quote:rows[index]!.text,meaning:'',reflection:'月色承接此处的远近之感。',relevance:.95,anchors:[]}]});
beforeEach(()=>{jest.clearAllMocks();jest.mocked(flowCorpus).mockResolvedValue(rows);jest.mocked(candidatesFor).mockResolvedValue(rows);});
function fixture(){let seq=0;const store=createSessionStore(new MemoryDocumentBackend(),{createId:()=>`scope-${seq++}`});const events:FlowEvent[]=[];return {store,events,run:(request:FlowRequest,owner='owner')=>runFlow(request,owner,new AbortController().signal,e=>events.push(e),store),chain:()=> (events.at(-1) as {chain:FlowChain}).chain};}
test('poetry completed resume reuses the exact generation key without generating again',async()=>{
  const f=fixture(),reserve=jest.spyOn(f.store,'reserve');jest.mocked(flowJson).mockResolvedValue(generated(0));
  await f.run({op:'open',requestId:'initial',seed:'月色',contentPacks:['core','poetry']});
  const root=f.chain();await f.run({op:'open',requestId:'resume',chainId:root.chainId});
  expect(reserve.mock.calls[1]![1].key).toBe(reserve.mock.calls[0]![1].key);
  expect(f.chain().chainId).toBe(root.chainId);expect(flowJson).toHaveBeenCalledTimes(1);
});
test('changed scope is rejected before generation and does not consume the old cursor',async()=>{
  const f=fixture();jest.mocked(flowJson).mockResolvedValue(generated(0));
  await f.run({op:'open',requestId:'initial',seed:'月色',contentPacks:['core','poetry']});const root=f.chain();
  await expect(f.run({op:'next',requestId:'changed',chainId:root.chainId,cursor:root.cursor!,contentPacks:['core']})).rejects.toMatchObject({code:'CONTENT_SCOPE_CHANGED'});
  expect(flowJson).toHaveBeenCalledTimes(1);expect((await f.store.getChain('owner',root.chainId)).chain.cursor).toBe(root.cursor);
});
test('distinct full-source words coexist and a repeated word replays its own child',async()=>{
  const f=fixture();jest.mocked(flowJson).mockResolvedValueOnce(generated(0));
  await f.run({op:'open',requestId:'initial',seed:'月色'});const root=f.chain(),frame=root.frames[0]!;
  const request=(word:number,id:string):FlowRequest=>({op:'open',requestId:id,contentPacks:['core'],rebaseFrom:{chainId:root.chainId,frameId:frame.id},restartFrom:{sourceId:frame.sourceId,corpusVersion:frame.corpusVersion,textHash:frame.textHash,quoteStart:frame.quoteStart,quoteEnd:frame.quoteEnd},selection:{start:word,end:word+1,textHash:frame.textHash,corpusVersion:frame.corpusVersion}});
  // Use server segmentation boundaries for each selected word.
  const boundaries=frame.lexicalBreaks!;const starts=[0,boundaries[0]!];
  const inputs=starts.map((start,i)=>({...request(start,'word-'+i),selection:{...request(start,'x').selection!,start,end:boundaries[i]!}}));
  jest.mocked(flowJson).mockResolvedValueOnce({sense:'原文意象',direction:'从远近看相知',terms:['相知','远近']}).mockResolvedValueOnce(generated(1));
  await f.run(inputs[0]!);const a=f.chain();
  jest.mocked(flowJson).mockResolvedValueOnce({sense:'原文意象',direction:'从月色看远近',terms:['相知','远近']}).mockResolvedValueOnce(generated(2));
  await f.run(inputs[1]!);const b=f.chain();
  expect(a.chainId).not.toBe(b.chainId);expect(Object.values((await f.store.getChain('owner',root.chainId)).branches)).toEqual(expect.arrayContaining([a.chainId,b.chainId]));
  const calls=jest.mocked(flowJson).mock.calls.length;await f.run({...inputs[0]!,requestId:'repeat'});expect(f.chain().chainId).toBe(a.chainId);expect(flowJson).toHaveBeenCalledTimes(calls);
  expect(resolveContentScope).toHaveBeenCalled();
});
