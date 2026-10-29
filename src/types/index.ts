export const DEFAULT_SEARCH_TOP_K = 5;
export const DEFAULT_SEARCH_THRESHOLD = 0.35;
export const HEALTH_STATUS_OK = "ok" as const;

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: ApiError;
    };

export interface PassageRecord {
  imagery?: string[];
  id: string;
  source: string;
  collection: string;
  workId: string;
  workTitle: string;
  chapter: string;
  section: number;
  text: string;
  textHash: string;
  corpusVersion: string;
  work?: import('@/lib/content/contracts').WorkReference;
}

export interface SearchRequest {
  query: string;
  topK?: number;
  threshold?: number;
  contentPacks?: import('@/lib/content/contracts').ContentPackId[];
}

export interface SearchResult {
  id: string;
  source: string;
  chapter: string;
  section: number;
  text: string;
  score: number;
  work?: import('@/lib/content/contracts').WorkReference;
}

export type AnnotationStyle = "academic" | "classical" | "modern" | "poetic";

export interface AnnotateRequest {
  query: string;
  passageId: string;
  passageText: string;
  style?: AnnotationStyle;
  visitedPassageIds?: string[];
  contentPacks?: import('@/lib/content/contracts').ContentPackId[];
}

export interface AnnotationLink {
  passageId: string;
  label: string;
  relationHint?: string;
  passageText: string;
  source: string;
  chapter: string;
  section: number;
}

export interface AnnotationAgentTrace {
  workAgentId: string;
  relationTheme: string;
  branchLabel: string;
  growthSummary: string;
}

export interface AnnotationResult {
  passageId: string;
  passageText: string;
  sixToMe: string;
  meToSix: string;
  links: AnnotationLink[];
  agentTrace?: AnnotationAgentTrace;
}

export interface HealthResponse {
  status: typeof HEALTH_STATUS_OK;
}
