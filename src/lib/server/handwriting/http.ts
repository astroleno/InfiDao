import { FlowError } from '../../flow/contracts';
import { HandwritingError } from './store';

export const privateHeaders = { 'Cache-Control': 'no-store, private', 'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
export async function handwritingResponse(action: () => Promise<unknown>, status = 200) {
  try { return Response.json(await action(), { status, headers: privateHeaders }); }
  catch (error) {
    const known = error instanceof HandwritingError || error instanceof FlowError;
    return Response.json({ error: { code: known ? error.code : 'HANDWRITING_UNAVAILABLE', message: known ? error.message : '手写制作暂不可用，草稿仍在本机。' } },
      { status: known ? error.status : 503, headers: privateHeaders });
  }
}
export async function limitedJSON(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HandwritingError('INVALID_CONTENT', '请重新确认草稿。', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new HandwritingError('INVALID_CONTENT', '请重新确认草稿。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200_000) { await reader.cancel(); throw new HandwritingError('TOO_LARGE', '文字过长，请减少所选内容。', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HandwritingError('INVALID_CONTENT', '请重新确认草稿。'); }
}
