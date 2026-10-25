import { readFile } from 'node:fs/promises';
import { requestReadSession } from '@/lib/flow/session-identity';
import { handwritingResponse, privateHeaders } from '@/lib/server/handwriting/http';
import { jobStore } from '@/lib/server/handwriting/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string; asset: string }> }) {
  let response: Response | null = null;
  const failure = await handwritingResponse(async () => {
    const { id, asset } = await context.params;
    const file = await jobStore<{ path: string }>('asset', { owner: requestReadSession(request), id, asset });
    const data = await readFile(file.path);
    response = new Response(new Uint8Array(data), { headers: { ...privateHeaders, 'Content-Type': 'image/png' } });
    return {};
  });
  return response || failure;
}
