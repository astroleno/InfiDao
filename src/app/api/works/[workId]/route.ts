import { poetryWork } from '@/lib/content/store';
import { buildErrorResponse, buildSuccessResponse, RouteError } from '@/lib/utils/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  try {
    const { workId } = await params;
    const revision = new URL(request.url).searchParams.get('revision');
    if (!/^[a-f0-9]{32}$/.test(workId) || !revision || !/^[a-f0-9]{24}$/.test(revision)) throw new RouteError(400, 'INVALID_WORK', '作品或版本信息不完整。');
    const work = await poetryWork(workId, revision);
    if (!work) throw new RouteError(404, 'WORK_NOT_FOUND', '这个版本的作品暂不可用，已读原句仍可保留。');
    const segmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' });
    return buildSuccessResponse({ ...work, passages: work.passages.map(p => ({ ...p, lexicalBreaks: Array.from(segmenter.segment(work.text.slice(p.start,p.end)), token => token.index + token.segment.length) })) }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch (error) { return buildErrorResponse(error); }
}
