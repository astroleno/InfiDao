import { FlowError } from '@/lib/flow/contracts';
import { isNativeRequest, issueSession } from '@/lib/flow/session-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const identity = issueSession(request);
    return Response.json(isNativeRequest(request) ? { token: identity.token } : { ready: true },
      { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': identity.cookie } });
  } catch (error) {
    return Response.json({ error: { code: error instanceof FlowError ? error.code : 'SESSION_UNAVAILABLE',
      message: error instanceof FlowError ? error.message : '暂时无法连接阅读服务。' } }, { status: error instanceof FlowError ? error.status : 503,
      headers: { 'Cache-Control': 'no-store' } });
  }
}
