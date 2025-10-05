import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface WikiNode {
  id: string;
  query: string;
  passage?: string;
  annotation?: any;
  timestamp: string;
  parentId?: string;
}

interface UIState {
  // UI State
  showWiki: boolean;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large';

  // Infinite Wiki State
  wikiNodes: WikiNode[];
  currentWikiPath: string[];
  wikiViewMode: 'graph' | 'list' | 'timeline';

  // Notifications
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message?: string;
    timestamp: string;
    autoClose?: boolean;
  }>;

  // Actions
  toggleWiki: (show?: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setFontSize: (size: 'small' | 'medium' | 'large') => void;

  // Wiki Actions
  addToWiki: (node: Omit<WikiNode, 'timestamp'>) => void;
  removeFromWiki: (nodeId: string) => void;
  clearWiki: () => void;
  setWikiViewMode: (mode: 'graph' | 'list' | 'timeline') => void;
  updateWikiPath: (path: string[]) => void;

  // Notification Actions
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // Initial State
      showWiki: false,
      sidebarOpen: false,
      theme: 'light',
      fontSize: 'medium',
      wikiNodes: [],
      currentWikiPath: [],
      wikiViewMode: 'graph',
      notifications: [],

      // Actions
      toggleWiki: (show) => set((state) => ({
        showWiki: show !== undefined ? show : !state.showWiki
      })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document
        if (typeof window !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark');
          localStorage.setItem('theme', theme);
        }
      },

      setFontSize: (fontSize) => {
        set({ fontSize });
        if (typeof window !== 'undefined') {
          document.documentElement.style.fontSize =
            fontSize === 'small' ? '14px' :
            fontSize === 'large' ? '18px' : '16px';
          localStorage.setItem('fontSize', fontSize);
        }
      },

      // Wiki Actions
      addToWiki: (node) => set((state) => ({
        wikiNodes: [
          {
            ...node,
            timestamp: new Date().toISOString()
          },
          ...state.wikiNodes.slice(0, 49) // Keep last 50 nodes
        ]
      })),

      removeFromWiki: (nodeId) => set((state) => ({
        wikiNodes: state.wikiNodes.filter(node => node.id !== nodeId)
      })),

      clearWiki: () => set({ wikiNodes: [], currentWikiPath: [] }),

      setWikiViewMode: (mode) => set({ wikiViewMode: mode }),

      updateWikiPath: (path) => set({ currentWikiPath: path }),

      // Notification Actions
      addNotification: (notification) => {
        const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();

        set((state) => ({
          notifications: [
            {
              ...notification,
              id,
              timestamp,
              autoClose: notification.autoClose !== false
            },
            ...state.notifications.slice(0, 9) // Keep last 10 notifications
          ]
        }));

        // Auto close notification after 5 seconds if enabled
        if (notification.autoClose !== false) {
          setTimeout(() => {
            get().removeNotification(id);
          }, 5000);
        }
      },

      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),

      clearNotifications: () => set({ notifications: [] })
    }),
    {
      name: 'ui-store',
    }
  )
);