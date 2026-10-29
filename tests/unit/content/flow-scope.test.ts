/** @jest-environment node */
import { runFlow } from '@/lib/flow/service';
import { flowJson } from '@/lib/flow/model';
import { candidatesFor, flowCorpus, planFocus } from '@/lib/flow/candidates';
import { resolveContentScope } from '@/lib/content/scope';
import { createSessionStore, MemoryDocumentBackend } from '@/lib/flow/session-store';
import type { FlowChain, FlowEvent, FlowRequest } from '@/lib/flow/contracts';
import { FLOW_PROMPT_VERSION } from '@/lib/flow/contracts';
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
  expect(planFocus).toHaveBeenCalledWith('月色',expect.any(AbortSignal),['core','poetry']);
  const root=f.chain();await f.run({op:'open',requestId:'resume',chainId:root.chainId});
  expect(reserve.mock.calls[1]![1].key).toBe(reserve.mock.calls[0]![1].key);
  expect(reserve.mock.calls[0]![1].key).toContain(':prompt:'+FLOW_PROMPT_VERSION);
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
  expect(jest.mocked(flowJson).mock.calls.some(([,input])=>(input as {targetScope?:{poetryEnabled:boolean}}).targetScope?.poetryEnabled===false)).toBe(true);
  expect(resolveContentScope).toHaveBeenCalled();
});
test('a failed legacy rebase edge cannot block a newly versioned plan for the same source word',async()=>{
  const f=fixture();jest.mocked(flowJson).mockResolvedValueOnce(generated(0));
  await f.run({op:'open',requestId:'root-for-upgrade',seed:'月色'});const root=f.chain(),frame=root.frames[0]!;
  const selection={start:0,end:frame.lexicalBreaks![0]!,textHash:frame.textHash,corpusVersion:frame.corpusVersion};
  const request:FlowRequest={op:'open',requestId:'new-planner',contentPacks:['core'],rebaseFrom:{chainId:root.chainId,frameId:frame.id},restartFrom:{sourceId:frame.sourceId,corpusVersion:frame.corpusVersion,textHash:frame.textHash,quoteStart:frame.quoteStart,quoteEnd:frame.quoteEnd},selection};
  const original=await f.store.getChain('owner',root.chainId);
  const oldEntry=`scope:core:${frame.sourceId}:${frame.quoteStart}:${frame.quoteEnd}:${selection.start}:${selection.end}`;
  const oldLease=(await f.store.reserve('owner',{key:'legacy-v15-failed-plan',requestId:'old-planner',fingerprint:'old-planner'})).lease!;
  const oldState={...original,generationKey:'legacy-v15-failed-plan',terms:['旧诗句检索词'],nodes:{},branches:{},seen:[],chain:{...root,chainId:'legacy-failed-child',parentChainId:root.chainId,frames:[]}};
  delete oldState.initial;
  await f.store.commitHead('owner',oldLease,oldState,{id:root.chainId,edge:frame.id+':'+oldEntry+':scope:core'});
  await f.store.release('owner',oldLease);
  jest.mocked(flowJson).mockResolvedValueOnce({sense:'原文意象',direction:'转向当前可用经典的相知',terms:['相知','远近']}).mockResolvedValueOnce(generated(1));
  await f.run(request);const child=f.chain(),saved=await f.store.getChain('owner',root.chainId);
  expect(child.chainId).not.toBe('legacy-failed-child');
  expect(Object.values(saved.branches)).toEqual(expect.arrayContaining(['legacy-failed-child',child.chainId]));
  expect(Object.keys(saved.branches).some(edge=>edge.endsWith(':prompt:'+FLOW_PROMPT_VERSION))).toBe(true);
});
test('a stored anchor is replanned for the new scope without reusing its old terms or target',async()=>{
  const f=fixture(),initial=generated(0);
  const anchor={surface:'reflection' as const,label:'月色',sense:'旧范围的义项',direction:'旧范围的方向',terms:['白日依山盡','黃河入海流'],target:{sourceId:rows[1]!.id,quote:rows[1]!.text,meaning:'旧目标'}};
  jest.mocked(flowJson).mockResolvedValueOnce({frames:[{...initial.frames[0],anchors:[anchor]}]});
  await f.run({op:'open',requestId:'anchor-root',seed:'月色',contentPacks:['core','poetry']});
  const root=f.chain(),frame=root.frames[0]!,stored=frame.anchors[0]!;
  expect(stored.id).toBeTruthy();
  jest.mocked(flowJson).mockResolvedValueOnce({sense:'当前词在联系中的月色意象',direction:'沿远近之感阅读当前可用经典',terms:['相知','远近']}).mockResolvedValueOnce(generated(2));
  await f.run({op:'branch',requestId:'anchor-new-scope',chainId:root.chainId,fromFrameId:frame.id,anchorId:stored.id,contentPacks:['core']});
  expect(jest.mocked(flowJson).mock.calls[1]![1]).toMatchObject({word:'月色',surface:'reflection',targetScope:{poetryEnabled:false}});
  expect(jest.mocked(candidatesFor).mock.calls.at(-1)![0]).toEqual(['相知','远近']);
  expect(f.chain().frames[0]!.sourceId).toBe(rows[2]!.id);
  expect(f.chain().contentScope?.packIds).toEqual(['core']);
  expect((await f.store.getChain('owner',root.chainId)).chain.contentScope?.packIds).toEqual(['core','poetry']);
});
