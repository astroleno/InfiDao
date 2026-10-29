import { listContentPacks } from '@/lib/content/registry';
import { buildErrorResponse, buildSuccessResponse } from '@/lib/utils/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return buildSuccessResponse(await listContentPacks()); }
  catch (error) { return buildErrorResponse(error); }
}
