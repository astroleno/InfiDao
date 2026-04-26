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
}

export interface SearchRequest {
  query: string;
  topK?: number;
  threshold?: number;
}

export interface SearchResult {
  id: string;
  source: string;
  chapter: string;
  section: number;
  text: string;
  score: number;
}

export type AnnotationStyle = "academic" | "classical" | "modern" | "poetic";

export interface AnnotateRequest {
  query: string;
  passageId: string;
  passageText: string;
  style?: AnnotationStyle;
}

export interface AnnotationLink {
  passageId: string;
  label: string;
  passageText: string;
  source: string;
  chapter: string;
  section: number;
}

export interface AnnotationResult {
  passageId: string;
  passageText: string;
  sixToMe: string;
  meToSix: string;
  links: AnnotationLink[];
}

export interface HealthResponse {
  status: typeof HEALTH_STATUS_OK;
}
