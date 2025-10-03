// Core Domain Types

export type Category = '儒家' | '道家' | '佛家';

export type DifficultyLevel = 'beginner' | 'elementary' | 'intermediate' | 'advanced';

export type RelationType =
  | 'prerequisite'
  | 'derived'
  | 'parallel'
  | 'opposite'
  | 'part_of'
  | 'contains'
  | 'implements'
  | 'supports'
  | 'similar'
  | 'contrasts';

// Node Types
export interface GraphNode {
  id: string;
  label: string;
  category: Category;
  classic: string;
  chapter?: string;
  originalText: string;
  fullQuote?: string;
  reference: string;
  interpretation?: string;
  embedding?: number[];
  position: { x: number; y: number };
  layer: number;
  unlocked: boolean;
  metadata: {
    difficulty: DifficultyLevel;
    tags: string[];
    relatedConcepts: string[];
    modernRelevance?: string;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  weight: number;
  bidirectional: boolean;
  description?: string;
}

// Recommendation Types
export interface Recommendation {
  nodeId: string;
  score: number;
  reason: string;
}

// Navigation Types
export type NavigationType = 'skill-tree' | 'wiki';

export interface NavigationHistory {
  id: string;
  type: NavigationType;
  timestamp: number;
  nodeData?: {
    nodeId: string;
    nodeName: string;
    category: string;
  };
  wikiData?: {
    topic: string;
    fromNode?: string;
    depth: number;
  };
  scrollPosition?: number;
}

// User Progress Types
export interface UserProgress {
  userId: string;
  unlockedNodes: string[];
  learningPath: {
    nodeId: string;
    timestamp: number;
    mode: NavigationType;
  }[];
  achievements: Achievement[];
  statistics: {
    totalNodesUnlocked: number;
    totalWikiExplorations: number;
    longestStreak: number;
    lastActiveDate: string;
  };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

// Content Types
export type ContentMode = 'node-detail' | 'wiki-explore';

export interface ContentState {
  mode: ContentMode;
  nodeData: GraphNode | null;
  wikiTopic: string | null;
  streamingText: string;
  isLoading: boolean;
  error: string | null;
}
