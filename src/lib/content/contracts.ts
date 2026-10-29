import { z } from 'zod';

export const contentPackIdsSchema = z.array(z.enum(['core', 'poetry'])).min(1).max(2).refine(ids => new Set(ids).size === ids.length && ids.includes('core'), 'Core content is required');
export type ContentPackId = 'core' | 'poetry';
export type ContentScope = { packIds: ContentPackId[]; versions: Record<string, string>; fingerprint: string; unavailable: string[] };
export interface WorkReference {
  packId: 'poetry'; workId: string; revision: string; start: number; end: number;
  title: string; author: string; dynasty: string; genre: string;
}
export interface PoetryWork {
  id: string; revision: string; title: string; author: string; dynasty: string; genre: string;
  text: string; lines: number[]; sourcePath: string; sourceIndex: number; upstreamId: string | null;
  attribution?: 'unknown' | 'as-recorded'; sourceUrl?: string;
  sourceRange?: {start:number;end:number}; sourceTitle?: string;
  passages: Array<{ id: string; start: number; end: number; textHash: string }>;
}
export interface PoetryManifest {
  schemaVersion: 1; packId: 'poetry'; version: string; indexModel: 'poetry-ngram-v2'; dimension: 64;
  repository: string; commit: string; license: string; works: number; passages: number;
  shards: Array<{ path: string; sha256: string; bytes: number; works: number; passages: number }>;
}
