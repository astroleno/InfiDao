/** @jest-environment node */
import { GET } from '@/app/api/works/[workId]/route';
import { poetryWork } from '@/lib/content/store';
jest.mock('@/lib/content/store',()=>({poetryWork:jest.fn()}));
const load=poetryWork as jest.Mock;
const id='a'.repeat(32),revision='b'.repeat(24);
afterEach(()=>jest.resetAllMocks());
test('unknown or malformed revisions cannot silently return current source',async()=>{
  expect((await GET(new Request('http://localhost/api/works/'+id),{params:Promise.resolve({workId:id})})).status).toBe(400);
  expect(load).not.toHaveBeenCalled();load.mockResolvedValue(null);
  expect((await GET(new Request(`http://localhost/api/works/${id}?revision=${revision}`),{params:Promise.resolve({workId:id})})).status).toBe(404);
});
test('full-work lookup returns exact text and segmentation for canonical selection',async()=>{
  const text='明月\n故乡';
  load.mockResolvedValue({id,revision,text,passages:[{id:'passage',start:0,end:text.length,textHash:'hash'}]});
  const response=await GET(new Request(`http://localhost/api/works/${id}?revision=${revision}`),{params:Promise.resolve({workId:id})});
  const body=await response.json();expect(body.data.text).toBe(text);expect(body.data.passages[0].lexicalBreaks.at(-1)).toBe(text.length);
  expect(load).toHaveBeenCalledWith(id,revision);
});
