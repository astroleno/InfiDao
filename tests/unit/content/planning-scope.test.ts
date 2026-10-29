/** @jest-environment node */
import { planFocus } from '@/lib/flow/candidates';
import { planLexeme } from '@/lib/flow/lexemes';
import { flowJson } from '@/lib/flow/model';
import type { FlowFrame } from '@/lib/flow/contracts';
jest.mock('@/lib/flow/model',()=>({flowJson:jest.fn()}));
const signal=new AbortController().signal;
beforeEach(()=>{jest.clearAllMocks();jest.mocked(flowJson).mockResolvedValue({supported:true,focus:'清泉与流动的景致',sense:'山间清澈流动的泉水',direction:'由泉水的流动读到不同经典的观察',terms:['原泉混混','井冽寒泉食']});});
test('root planning distinguishes enabled poetry from the default core sources',async()=>{
  await planFocus('清泉',signal);
  expect(jest.mocked(flowJson).mock.calls[0]![1]).toMatchObject({targetScope:{poetryEnabled:false,coreSources:expect.arrayContaining(['诗经','孟子','周易'])}});
  await planFocus('清泉',signal,['core','poetry']);
  expect(jest.mocked(flowJson).mock.calls[1]![1]).toMatchObject({targetScope:{poetryEnabled:true}});
});
test('a retained poem supplies context while word planning targets the current core-only scope',async()=>{
  const frame={source:'山居秋暝',chapterLabel:'唐 · 王維',quote:'清泉石上流。',quoteStart:0,quoteEnd:6,fullText:'清泉石上流。',textHash:'canonical',corpusVersion:'poetry:revision',lexicalBreaks:[2,3,5,6],work:{packId:'poetry',workId:'w',revision:'revision',start:0,end:6,title:'山居秋暝',author:'王維',dynasty:'唐',genre:'诗'}} as FlowFrame;
  await planLexeme(frame,{start:0,end:2,textHash:'canonical',corpusVersion:'poetry:revision'},'赏景',signal,['core']);
  expect(jest.mocked(flowJson).mock.calls[0]![1]).toMatchObject({word:'清泉',source:'山居秋暝',targetScope:{poetryEnabled:false}});
});
