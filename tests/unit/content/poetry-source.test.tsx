import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PoetrySource } from '@/components/flow/PoetrySource';
import type { FlowFrame } from '@/lib/flow/contracts';
jest.mock('@/lib/flow-browser/fonts',()=>({prepareFlowFonts:jest.fn(async()=>({}))}));
const first='明月照故乡。\n',second='远山入暮色。\n归舟在水边。';
const reference={packId:'poetry' as const,workId:'a'.repeat(32),revision:'b'.repeat(24),start:0,end:first.length,title:'月夜',author:'作者不详',dynasty:'不详',genre:'诗'};
const frame: FlowFrame={id:'read-frame',ordinal:1,sourceId:'first',textHash:'first-hash',corpusVersion:'poetry:'+reference.revision,quote:'明月照故乡。',quoteStart:0,quoteEnd:6,fullText:first,source:'月夜',chapterLabel:'不详',meaning:'',reflection:'',anchors:[],lexicalBreaks:[1,2,3,4,5,6,7],reflectionSpans:[],provenance:'model',ready:true,work:reference};
const work={...reference,id:reference.workId,text:first+second,passages:[{id:'first',start:0,end:first.length,textHash:'first-hash',lexicalBreaks:[1,2,3,4,5,6,7]},
  {id:'second',start:first.length,end:first.length+second.length,textHash:'second-hash',lexicalBreaks:Array.from(second,(_,i)=>i+1)}]};
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;jest.restoreAllMocks();});
test('full work highlights only the actual quoted passage and selects canonical later text',async()=>{
  global.fetch=jest.fn(async()=>({ok:true,json:async()=>({data:work})})) as unknown as typeof fetch;
  const onSelect=jest.fn(),view=render(<PoetrySource frame={frame} onSelect={onSelect}/>);
  await screen.findByText(/作品全文/);
  const highlighted=[...view.container.querySelectorAll('[data-source-quote]')].map(x=>x.textContent).join('');
  expect(highlighted).toBe('明月照故乡');
  fireEvent.click(screen.getByTitle('沿「山」接续'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({id:frame.id,sourceId:'second',fullText:second,textHash:'second-hash',quote:'远山入暮色。',work:expect.objectContaining({start:first.length})}),
    expect.objectContaining({start:1,end:2,textHash:'second-hash'}),'山');
});
test('unavailable full work preserves the fragment and can retry without relabeling it complete',async()=>{
  const fetcher=jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({data:work})});
  global.fetch=fetcher;
  render(<PoetrySource frame={frame} onSelect={jest.fn()}/>);
  await screen.findByText('整首暂不可用，已读片段仍可阅读。');
  expect(screen.getByText(/已读片段$/)).toBeInTheDocument();
  expect(screen.getByText(first.trim())).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'重试读取整首'}));
  await waitFor(()=>expect(screen.getByText(/作品全文/)).toBeInTheDocument());
});
