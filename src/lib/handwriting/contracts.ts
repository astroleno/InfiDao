export const HANDWRITING_VERSION = 'reading-card-1';
export const RENDERER_VERSION = 'inko-a1e2d492-1';
export const MAX_TEXT_LENGTH = 20_000;
export const LAYOUTS = { cream: '素笺', white: '白笺' } as const;
export type CardLayout = keyof typeof LAYOUTS;
export type ContentPart = 'quote' | 'source' | 'note' | 'date' | 'signature';
export type SourceRef = { pathId?: string; frameId?: string; noteId?: string; noteRevision?: string };
export type KeepsakeSource = {
  sourceRef: SourceRef; quote: string; sourceLabel: string; chapterLabel: string;
  noteText?: string; date?: number;
};
export type ReadingKeepsakeDraft = KeepsakeSource & {
  draftId: string; dateLabel: string; signature: string; styleCode: string;
  createdAt: number;
  layout: CardLayout; layoutVersion: string; contentDigest: string;
  included: Record<ContentPart, boolean>;
};
export type TextBlock = { role: ContentPart; start: number; end: number };
export type GenerationContent = {
  text: string; blocks: TextBlock[]; styleCode: string; layout: CardLayout;
  model: 'lyric-1'; pen: { type: 'original'; color: 'black'; weight: 0; ink: 0 };
  layoutVersion: string; rendererVersion: string; label: 'visible';
};
export type CreateKeepsakeJob = {
  requestId: string; contentDigest: string; content: GenerationContent; consent: true;
};
export type KeepsakeStatus = 'queued' | 'running' | 'preparing' | 'ready' | 'failed' | 'cancelled' | 'expired';
export const STATUS_LABEL: Record<KeepsakeStatus, string> = {
  queued: '排队中', running: '正在书写', preparing: '正在整理卡面', ready: '可以保存了',
  failed: '制作未完成', cancelled: '已取消', expired: '导出记录已过期',
};
export const isPending = (status: KeepsakeStatus) => ['queued', 'running', 'preparing'].includes(status);
export type AigcFields = Record<string, string> & { Label: string; ContentProducer: string; ProduceID: string };
export type PreparedPage = {
  index: number; width: number; height: number; layer: string; aigc: AigcFields; xmp: string;
};
export type KeepsakeJob = {
  id: string; requestId: string; contentDigest: string; status: KeepsakeStatus;
  createdAt: number; expiresAt: number; pages: PreparedPage[]; pagesDone: number;
  retryPreparation?: boolean;
  error?: { code: string; message: string; positions?: Array<{ symbol: string; position: number }> };
};
export type HandwritingCapabilities = {
  ownerScope: string; configured: boolean; reason?: string;
  styles: Array<{ id: string; label: string; favorite: boolean; default: boolean }>;
};
export type CachedKeepsake = {
  key: string; scope: string; draft: ReadingKeepsakeDraft; request: CreateKeepsakeJob | null;
  job: KeepsakeJob | null; pages: Blob[]; pdf: Blob | null; updatedAt: number;
  invalidated?: boolean;
};
