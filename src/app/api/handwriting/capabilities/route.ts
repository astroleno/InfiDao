import { requestReadSession } from '@/lib/flow/session-identity';
import { capabilities } from '@/lib/server/handwriting/service';
import { handwritingResponse } from '@/lib/server/handwriting/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handwritingResponse(() => capabilities(requestReadSession(request)));
}
