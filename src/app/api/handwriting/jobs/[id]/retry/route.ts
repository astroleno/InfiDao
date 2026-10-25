import { requestSession } from '@/lib/flow/session-identity';
import { handwritingResponse } from '@/lib/server/handwriting/http';
import { jobStore } from '@/lib/server/handwriting/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handwritingResponse(async () => jobStore('retry', { owner: requestSession(request), id: (await context.params).id }));
}
