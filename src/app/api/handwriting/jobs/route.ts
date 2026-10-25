import { requestReadSession, requestSession } from '@/lib/flow/session-identity';
import { createJob } from '@/lib/server/handwriting/service';
import { handwritingResponse, limitedJSON } from '@/lib/server/handwriting/http';
import { HandwritingError, jobStore } from '@/lib/server/handwriting/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handwritingResponse(async () => {
    const owner = requestSession(request);
    return createJob(owner, await limitedJSON(request));
  }, 202);
}
export async function GET(request: Request) {
  return handwritingResponse(async () => {
    const owner = requestReadSession(request);
    const requestId = new URL(request.url).searchParams.get('requestId');
    if (!requestId || !/^[0-9a-f-]{36}$/.test(requestId)) throw new HandwritingError('INVALID_ID', '找不到这次发送。');
    return jobStore('get', { owner, requestId });
  });
}
export async function DELETE(request: Request) {
  return handwritingResponse(async () => {
    const owner = requestSession(request);
    const requestId = new URL(request.url).searchParams.get('requestId');
    if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new HandwritingError('INVALID_ID', '找不到这次发送。');
    return jobStore('revoke', { owner, requestId });
  });
}
