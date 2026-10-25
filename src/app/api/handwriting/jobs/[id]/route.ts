import { requestReadSession, requestSession } from '@/lib/flow/session-identity';
import { handwritingResponse } from '@/lib/server/handwriting/http';
import { jobStore } from '@/lib/server/handwriting/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handwritingResponse(async () => jobStore('get', { owner: requestReadSession(request), id: (await context.params).id }));
}
export async function DELETE(request: Request, context: Context) {
  return handwritingResponse(async () => jobStore('delete', { owner: requestSession(request), id: (await context.params).id }));
}
