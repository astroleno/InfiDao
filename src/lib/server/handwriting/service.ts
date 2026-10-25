import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import { HANDWRITING_VERSION, RENDERER_VERSION, MAX_TEXT_LENGTH, type GenerationContent, type HandwritingCapabilities, type KeepsakeJob } from '../../handwriting/contracts';
import { digestInput } from '../../handwriting/reading-draft';
import { HandwritingError, jobStore } from './store';

const contentSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  blocks: z.array(z.object({ role: z.enum(['quote', 'source', 'note', 'date', 'signature']), start: z.number().int().min(0), end: z.number().int().positive() }).strict()).min(1).max(5),
  styleCode: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), layout: z.enum(['cream', 'white']), model: z.literal('lyric-1'),
  pen: z.object({ type: z.literal('original'), color: z.literal('black'), weight: z.literal(0), ink: z.literal(0) }).strict(),
  layoutVersion: z.literal(HANDWRITING_VERSION), rendererVersion: z.literal(RENDERER_VERSION), label: z.literal('visible'),
}).strict();
const createSchema = z.object({ requestId: z.string().uuid(), contentDigest: z.string().regex(/^[a-f0-9]{64}$/), content: contentSchema, consent: z.literal(true) }).strict();

export function ownerScope(owner: string) {
  // Owner IDs are already opaque signed-session identifiers; avoid sending them to browsers or upstream.
  return createHmac('sha256', process.env.FLOW_SESSION_SECRET || 'infidao-handwriting-local-scope').update('keepsake:' + owner).digest('hex');
}

type StyleCache = { key: string; expires: number; styles: HandwritingCapabilities['styles']; pending: Promise<HandwritingCapabilities['styles']> | null };
const shared = globalThis as typeof globalThis & { __infidaoInkoStyles?: StyleCache };
async function availableStyles() {
  const key = process.env.INKO_API_KEY;
  if (!key) throw new HandwritingError('NOT_CONFIGURED', '手写纪念卡尚未配置。', 503);
  const cached = shared.__infidaoInkoStyles;
  if (cached?.key === key && cached.expires > Date.now()) return cached.styles;
  if (cached?.key === key && cached.pending) return cached.pending;
  const next: StyleCache = { key, expires: 0, styles: [], pending: null };
  shared.__infidaoInkoStyles = next;
  next.pending = fetchStyles(key).then(styles => { next.styles = styles; next.expires = Date.now() + 300_000; return styles; })
    .finally(() => { next.pending = null; });
  return next.pending;
}
async function fetchStyles(key: string): Promise<HandwritingCapabilities['styles']> {
  let response: Response;
  try { response = await fetch('https://api.inkotype.com/v1/styles?model=lyric-1', {
    headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error',
  }); } catch { throw new HandwritingError('UPSTREAM_UNAVAILABLE', '字迹暂时无法取回，请稍后重试。', 503); }
  if (!response.ok) throw new HandwritingError('UPSTREAM_UNAVAILABLE', '手写服务暂不可用，请稍后重试。', 503);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new HandwritingError('UPSTREAM_CHANGED', '手写服务返回格式已变化，请稍后再试。', 503);
  const styles: HandwritingCapabilities['styles'] = body.data.filter((item: Record<string, unknown>) =>
    typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(item.id) && item.locked !== true && item.status === 'active' && Array.isArray(item.models) && item.models.includes('lyric-1')
  ).map((item: Record<string, unknown>) => ({ id: String(item.id), label: typeof item.label === 'string' ? item.label : String(item.id), favorite: item.favorite === true, default: item.default === true }));
  styles.sort((a, b) => Number(b.default) - Number(a.default) || Number(b.favorite) - Number(a.favorite));
  return styles;
}

export async function capabilities(owner: string): Promise<HandwritingCapabilities> {
  const scope = ownerScope(owner);
  if (!process.env.INKO_API_KEY) return { ownerScope: scope, configured: false, reason: '手写纪念卡尚未配置，草稿仍可保存在本机。', styles: [] };
  let styles: HandwritingCapabilities['styles'];
  try { styles = await availableStyles(); }
  catch { return { ownerScope: scope, configured: false, reason: '字迹暂不可取回，可以先在本机保留草稿。', styles: [] }; }
  const health = await jobStore<{ workerReady: boolean }>('health', {}).catch(() => ({ workerReady: false }));
  return { ownerScope: scope, configured: health.workerReady && styles.length > 0, styles,
    ...(!health.workerReady ? { reason: '手写制作暂未启动；可以先保存草稿，稍后再来。' } : {}) };
}

export function validateCreate(owner: string, raw: unknown) {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) throw new HandwritingError('INVALID_DRAFT', '草稿格式有误，请检查文字与所选字迹。');
  const input = parsed.data;
  const content: GenerationContent = input.content;
  let end = 0;
  const seen = new Set<string>();
  for (const block of content.blocks) {
    if (block.start < end || block.end > content.text.length || block.start >= block.end || seen.has(block.role) ||
      (block.start !== end && content.text.slice(end, block.start) !== '\n\n')) throw new HandwritingError('INVALID_DRAFT', '文字区块与预览不一致，请重新确认。');
    seen.add(block.role); end = block.end;
  }
  if (end !== content.text.length || content.blocks[0]?.start !== 0 || !content.text.trim() || /\r|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content.text)) {
    throw new HandwritingError('INVALID_DRAFT', '文字区块与预览不一致，请重新确认。');
  }
  const digest = createHash('sha256').update(digestInput(ownerScope(owner), content)).digest('hex');
  if (digest !== input.contentDigest) throw new HandwritingError('DIGEST_MISMATCH', '草稿已变化，请重新确认发送文字。', 409);
  return input;
}

export async function createJob(owner: string, raw: unknown) {
  const input = validateCreate(owner, raw);
  const settings = await capabilities(owner);
  if (!settings.configured) throw new HandwritingError('NOT_CONFIGURED', settings.reason || '手写制作暂不可用。', 503);
  if (!settings.styles.some(style => style.id === input.content.styleCode)) throw new HandwritingError('STYLE_UNAVAILABLE', '这份字迹已不可用，请重新选择。');
  return jobStore<KeepsakeJob>('create', { owner, ...input });
}
