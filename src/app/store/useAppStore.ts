import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GraphNode,
  GraphEdge,
  ContentMode,
  NavigationHistory,
  UserProgress,
  Recommendation,
} from '@/shared/types';

interface AppState {
  // Skill Tree State
  skillTree: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    unlocked: Set<string>;
    currentNode: string | null;
  };

  // Content Display State
  content: {
    mode: ContentMode;
    nodeData: GraphNode | null;
    wikiTopic: string | null;
    streamingText: string;
    isLoading: boolean;
    error: string | null;
  };

  // User Interaction State
  user: {
    history: NavigationHistory[];
    currentHistoryIndex: number;
    preferences: {
      density: 'comfortable' | 'compact' | 'spacious';
      enableAnimations: boolean;
    };
  };

  // Recommendations State
  recommendations: Recommendation[];

  // Actions
  setNodes: (nodes: GraphNode[]) => void;
  setEdges: (edges: GraphEdge[]) => void;
  unlockNode: (nodeId: string) => void;
  setCurrentNode: (nodeId: string | null) => void;
  setContentMode: (mode: ContentMode) => void;
  setNodeData: (node: GraphNode | null) => void;
  setWikiTopic: (topic: string | null) => void;
  setStreamingText: (text: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setRecommendations: (recommendations: Recommendation[]) => void;
  addToHistory: (entry: NavigationHistory) => void;
  goBack: () => void;
  goForward: () => void;
  backToSkillTree: () => void;
  reset: () => void;
}

const initialState = {
  skillTree: {
    nodes: [],
    edges: [],
    unlocked: new Set<string>(),
    currentNode: null,
  },
  content: {
    mode: 'node-detail' as ContentMode,
    nodeData: null,
    wikiTopic: null,
    streamingText: '',
    isLoading: false,
    error: null,
  },
  user: {
    history: [],
    currentHistoryIndex: -1,
    preferences: {
      density: 'comfortable' as const,
      enableAnimations: true,
    },
  },
  recommendations: [],
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Setters
      setNodes: (nodes) =>
        set((state) => ({
          skillTree: { ...state.skillTree, nodes },
        })),

      setEdges: (edges) =>
        set((state) => ({
          skillTree: { ...state.skillTree, edges },
        })),

      unlockNode: (nodeId) =>
        set((state) => {
          const unlocked = new Set(state.skillTree.unlocked);
          unlocked.add(nodeId);
          return {
            skillTree: { ...state.skillTree, unlocked },
          };
        }),

      setCurrentNode: (nodeId) =>
        set((state) => ({
          skillTree: { ...state.skillTree, currentNode: nodeId },
        })),

      setContentMode: (mode) =>
        set((state) => ({
          content: { ...state.content, mode },
        })),

      setNodeData: (node) =>
        set((state) => ({
          content: { ...state.content, nodeData: node },
        })),

      setWikiTopic: (topic) =>
        set((state) => ({
          content: { ...state.content, wikiTopic: topic },
        })),

      setStreamingText: (text) =>
        set((state) => ({
          content: { ...state.content, streamingText: text },
        })),

      setIsLoading: (isLoading) =>
        set((state) => ({
          content: { ...state.content, isLoading },
        })),

      setError: (error) =>
        set((state) => ({
          content: { ...state.content, error },
        })),

      setRecommendations: (recommendations) => set({ recommendations }),

      addToHistory: (entry) =>
        set((state) => {
          const history = [
            ...state.user.history.slice(0, state.user.currentHistoryIndex + 1),
            entry,
          ];

          // Limit history to 50 entries
          const limitedHistory = history.slice(-50);

          return {
            user: {
              ...state.user,
              history: limitedHistory,
              currentHistoryIndex: limitedHistory.length - 1,
            },
          };
        }),

      goBack: () =>
        set((state) => {
          if (state.user.currentHistoryIndex > 0) {
            const newIndex = state.user.currentHistoryIndex - 1;
            const entry = state.user.history[newIndex];

            return {
              user: {
                ...state.user,
                currentHistoryIndex: newIndex,
              },
              content: {
                ...state.content,
                mode: entry.type === 'skill-tree' ? 'node-detail' : 'wiki-explore',
                nodeData: entry.nodeData ?
                  state.skillTree.nodes.find(n => n.id === entry.nodeData?.nodeId) || null
                  : null,
                wikiTopic: entry.wikiData?.topic || null,
              },
            };
          }
          return state;
        }),

      goForward: () =>
        set((state) => {
          if (state.user.currentHistoryIndex < state.user.history.length - 1) {
            const newIndex = state.user.currentHistoryIndex + 1;
            const entry = state.user.history[newIndex];

            return {
              user: {
                ...state.user,
                currentHistoryIndex: newIndex,
              },
              content: {
                ...state.content,
                mode: entry.type === 'skill-tree' ? 'node-detail' : 'wiki-explore',
                nodeData: entry.nodeData ?
                  state.skillTree.nodes.find(n => n.id === entry.nodeData?.nodeId) || null
                  : null,
                wikiTopic: entry.wikiData?.topic || null,
              },
            };
          }
          return state;
        }),

      backToSkillTree: () =>
        set((state) => {
          // Find the last skill-tree entry
          for (let i = state.user.currentHistoryIndex - 1; i >= 0; i--) {
            const entry = state.user.history[i];
            if (entry.type === 'skill-tree') {
              return {
                user: {
                  ...state.user,
                  currentHistoryIndex: i,
                },
                content: {
                  ...state.content,
                  mode: 'node-detail',
                  nodeData: entry.nodeData ?
                    state.skillTree.nodes.find(n => n.id === entry.nodeData?.nodeId) || null
                    : null,
                  wikiTopic: null,
                },
              };
            }
          }
          return state;
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'infidao-store',
      partialize: (state) => ({
        skillTree: {
          ...state.skillTree,
          unlocked: Array.from(state.skillTree.unlocked),
        },
        user: state.user,
      }),
    }
  )
);
