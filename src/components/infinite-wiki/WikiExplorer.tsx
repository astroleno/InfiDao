import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WikiNode } from '@/lib/stores/uiStore';

interface WikiExplorerProps {
  nodes: WikiNode[];
  onClose: () => void;
  onSelectPassage: (passageId: string, passageText: string) => void;
}

interface ExplorerNode extends WikiNode {
  children: ExplorerNode[];
  level: number;
}

type ViewMode = 'graph' | 'list' | 'timeline';

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'graph', label: '图谱' },
  { id: 'list', label: '列表' },
  { id: 'timeline', label: '时间轴' },
];

export function WikiExplorer({ nodes, onClose, onSelectPassage }: WikiExplorerProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const buildTree = useCallback((flatNodes: WikiNode[]): ExplorerNode[] => {
    const nodeMap = new Map<string, ExplorerNode>();
    const rootNodes: ExplorerNode[] = [];

    flatNodes.forEach((node) => {
      nodeMap.set(node.id, {
        ...node,
        children: [],
        level: 0,
      });
    });

    flatNodes.forEach((node) => {
      const explorerNode = nodeMap.get(node.id);

      if (!explorerNode) {
        return;
      }

      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId);

        if (parent) {
          parent.children.push(explorerNode);
          explorerNode.level = parent.level + 1;
        }
      } else {
        rootNodes.push(explorerNode);
      }
    });

    return rootNodes;
  }, []);

  const treeData = useMemo(() => buildTree(nodes), [nodes, buildTree]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }, []);

  const handleNodeClick = useCallback((node: WikiNode) => {
    setSelectedNode(node.id);

    if (node.passage) {
      onSelectPassage(node.id, node.passage);
    }
  }, [onSelectPassage]);

  const renderAnnotationDot = (node: WikiNode) =>
    node.annotation ? (
      <span className="h-2 w-2 border border-zen bg-zen/70" title="已有注释" />
    ) : null;

  const renderNode = useCallback((node: ExplorerNode) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;
    const hasChildren = node.children.length > 0;

    return (
      <motion.div
        key={node.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="wiki-node"
        style={{ marginLeft: `${node.level * 24}px` }}
      >
        <div
          className={`flex cursor-pointer items-center gap-3 border-y p-3 transition ${
            isSelected
              ? 'border-zen/70 bg-stone-950/82'
              : 'border-stone-800 bg-stone-950/52 hover:border-zen/45'
          }`}
          onClick={() => handleNodeClick(node)}
        >
          {hasChildren && (
            <button
              type="button"
              aria-label={isExpanded ? `收起：${node.query}` : `展开：${node.query}`}
              onClick={(event) => {
                event.stopPropagation();
                toggleExpand(node.id);
              }}
              className="flex h-7 w-7 items-center justify-center border border-stone-800 text-stone-400 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
            >
              <motion.svg
                className="h-4 w-4"
                animate={{ rotate: isExpanded ? 90 : 0 }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </motion.svg>
            </button>
          )}

          <div className={`flex h-8 w-8 items-center justify-center border ${
            isSelected ? 'border-zen text-zen' : 'border-stone-700 text-stone-400'
          }`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-paper">{node.query}</h3>
            {node.passage && (
              <p className="mt-1 truncate text-sm text-stone-400">{node.passage}</p>
            )}
            <div className="mt-1 text-xs text-stone-600">
              {new Date(node.timestamp).toLocaleString('zh-CN')}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {renderAnnotationDot(node)}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleNodeClick(node);
              }}
              className="border-b border-stone-700 pb-1 text-sm text-zen transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
            >
              探索
            </button>
          </div>
        </div>

        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2"
            >
              {node.children.map(renderNode)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }, [expandedNodes, handleNodeClick, selectedNode, toggleExpand]);

  const renderEmptyState = () => (
    <div className="py-12 text-center text-stone-500">
      <svg className="mx-auto mb-4 h-16 w-16 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-paper font-classic">还没有探索记录</p>
      <p className="mt-2 text-sm">搜索和注释经文后，将在此显出回响路径。</p>
    </div>
  );

  const renderGraphView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="mb-2 text-lg font-medium text-paper font-classic">回响图谱</h3>
        <p className="text-sm text-stone-400">探索句与句之间的关联与脉络。</p>
      </div>

      {treeData.length > 0 ? (
        <div className="space-y-2">
          {treeData.map(renderNode)}
        </div>
      ) : renderEmptyState()}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-4 p-6">
      <div className="mb-6">
        <h3 className="mb-2 text-lg font-medium text-paper font-classic">探索列表</h3>
        <p className="text-sm text-stone-400">按时间顺序查看已进入的经文。</p>
      </div>

      {nodes.map((node, index) => (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`flex cursor-pointer items-start gap-4 border-y p-4 transition ${
            selectedNode === node.id
              ? 'border-zen/70 bg-stone-950/82'
              : 'border-stone-800 bg-stone-950/52 hover:border-zen/45'
          }`}
          onClick={() => handleNodeClick(node)}
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-stone-800 text-sm font-medium text-zen">
            {index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-paper">{node.query}</h4>
            {node.passage && (
              <p className="mt-1 line-clamp-2 text-sm text-stone-400">{node.passage}</p>
            )}
            <div className="mt-2 text-xs text-stone-600">
              {new Date(node.timestamp).toLocaleString('zh-CN')}
            </div>
          </div>

          {renderAnnotationDot(node)}
        </motion.div>
      ))}
    </div>
  );

  const renderTimelineView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="mb-2 text-lg font-medium text-paper font-classic">时间轴视图</h3>
        <p className="text-sm text-stone-400">查看思想进入经典后的演进路径。</p>
      </div>

      <div className="relative">
        <div className="absolute bottom-0 left-6 top-0 w-px bg-stone-800" />

        <div className="space-y-6">
          {nodes.map((node, index) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex items-start gap-6"
            >
              <div className={`z-10 flex h-12 w-12 items-center justify-center border bg-stone-950 ${
                selectedNode === node.id ? 'border-zen text-zen' : 'border-stone-800 text-stone-500'
              }`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>

              <div
                className={`flex-1 cursor-pointer border-y p-4 transition ${
                  selectedNode === node.id
                    ? 'border-zen/70 bg-stone-950/82'
                    : 'border-stone-800 bg-stone-950/52 hover:border-zen/45'
                }`}
                onClick={() => handleNodeClick(node)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-paper">{node.query}</h4>
                    {node.passage && (
                      <p className="mt-1 text-sm text-stone-400">{node.passage}</p>
                    )}
                  </div>
                  {renderAnnotationDot(node)}
                </div>
                <div className="mt-3 text-xs text-stone-600">
                  {new Date(node.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/78 p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-explorer-title"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden border border-stone-800 bg-stone-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 p-6">
          <div>
            <h2 id="wiki-explorer-title" className="text-xl font-semibold text-paper font-classic">无限经典探索</h2>
            <p className="mt-1 text-sm text-stone-400">沿经文继续，查看已经形成的回响路径。</p>
          </div>

          <div className="flex items-center gap-4">
            <div role="group" aria-label="探索视图" className="flex items-center border-y border-stone-800 p-1">
              {VIEW_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={viewMode === mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={`px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink ${
                    viewMode === mode.id
                      ? 'bg-zen text-ink'
                      : 'text-stone-400 hover:text-paper'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label="关闭无限经典探索"
              onClick={onClose}
              className="border border-stone-800 p-2 text-stone-400 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {viewMode === 'graph' && renderGraphView()}
          {viewMode === 'list' && renderListView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </div>

        <div className="border-t border-stone-800 bg-stone-900/40 p-4">
          <div className="flex items-center justify-between text-sm text-stone-400">
            <span>共 {nodes.length} 个探索节点</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setExpandedNodes(new Set(nodes.map(node => node.id)))}
                className="border-b border-stone-700 pb-1 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                展开全部
              </button>
              <button
                type="button"
                onClick={() => setExpandedNodes(new Set())}
                className="border-b border-stone-700 pb-1 transition hover:border-zen hover:text-paper focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
              >
                收起全部
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
