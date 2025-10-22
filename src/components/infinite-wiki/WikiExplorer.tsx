import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WikiNode } from '@/lib/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

interface WikiExplorerProps {
  nodes: WikiNode[];
  onClose: () => void;
  onSelectPassage: (passageId: string, passageText: string) => void;
}

interface ExplorerNode extends WikiNode {
  children: ExplorerNode[];
  level: number;
}

export function WikiExplorer({ nodes, onClose, onSelectPassage }: WikiExplorerProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'list' | 'timeline'>('graph');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Build hierarchical tree structure
  const buildTree = useCallback((flatNodes: WikiNode[]): ExplorerNode[] => {
    const nodeMap = new Map<string, ExplorerNode>();
    const rootNodes: ExplorerNode[] = [];

    // Create all nodes
    flatNodes.forEach((node, index) => {
      nodeMap.set(node.id, {
        ...node,
        children: [],
        level: 0
      });
    });

    // Build hierarchy
    flatNodes.forEach((node, index) => {
      const explorerNode = nodeMap.get(node.id)!;

      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(explorerNode);
        explorerNode.level = parent.level + 1;
      } else {
        rootNodes.push(explorerNode);
      }
    });

    return rootNodes;
  }, []);

  const treeData = useMemo(() => buildTree(nodes), [nodes, buildTree]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  const handleNodeClick = useCallback((node: WikiNode) => {
    setSelectedNode(node.id);
    if (node.passage) {
      onSelectPassage(node.id, node.passage);
    }
  }, [onSelectPassage]);

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
          className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
            isSelected
              ? 'bg-primary-100 border border-primary-300'
              : 'bg-white hover:bg-gray-50 border border-gray-200'
          }`}
          onClick={() => handleNodeClick(node)}
        >
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 transition-colors"
            >
              <motion.svg
                className="w-4 h-4 text-gray-600"
                animate={{ rotate: isExpanded ? 90 : 0 }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </motion.svg>
            </button>
          )}

          {/* Node Icon */}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isSelected ? 'bg-primary-600' : 'bg-gray-400'
          }`}>
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          {/* Node Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{node.query}</h3>
            {node.passage && (
              <p className="text-sm text-gray-600 truncate mt-1">{node.passage}</p>
            )}
            <div className="text-xs text-gray-400 mt-1">
              {new Date(node.timestamp).toLocaleString('zh-CN')}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {node.annotation && (
              <div className="w-2 h-2 bg-green-500 rounded-full" title="已有注释" />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleNodeClick(node);
              }}
            >
              探索
            </Button>
          </div>
        </div>

        {/* Children */}
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
  }, [expandedNodes, selectedNode, handleNodeClick, toggleExpand]);

  const renderGraphView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">知识图谱</h3>
        <p className="text-sm text-gray-600">探索思想之间的关联与脉络</p>
      </div>

      {treeData.length > 0 ? (
        <div className="space-y-2">
          {treeData.map(renderNode)}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p>还没有探索记录</p>
          <p className="text-sm mt-2">搜索和注释经文后将在此显示关联图谱</p>
        </div>
      )}
    </div>
  );

  const renderListView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">时间线</h3>
        <p className="text-sm text-gray-600">按时间顺序查看您的探索历程</p>
      </div>

      <div className="space-y-4">
        {nodes.map((node, index) => (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
              selectedNode === node.id
                ? 'border-primary-300 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
            onClick={() => handleNodeClick(node)}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-600">{index + 1}</span>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900">{node.query}</h4>
              {node.passage && (
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{node.passage}</p>
              )}
              <div className="text-xs text-gray-400 mt-2">
                {new Date(node.timestamp).toLocaleString('zh-CN')}
              </div>
            </div>

            {node.annotation && (
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-green-500 rounded-full" title="已有注释" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderTimelineView = () => (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">时间轴视图</h3>
        <p className="text-sm text-gray-600">查看思想的演进路径</p>
      </div>

      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-6">
          {nodes.map((node, index) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex items-start gap-6"
            >
              {/* Timeline Node */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
                selectedNode === node.id
                  ? 'bg-primary-600 border-4 border-primary-100'
                  : 'bg-white border-4 border-gray-200'
              }`}>
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>

              {/* Content */}
              <div
                className={`flex-1 p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedNode === node.id
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                onClick={() => handleNodeClick(node)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{node.query}</h4>
                    {node.passage && (
                      <p className="text-sm text-gray-600 mt-1">{node.passage}</p>
                    )}
                  </div>
                  {node.annotation && (
                    <div className="w-2 h-2 bg-green-500 rounded-full ml-2 mt-2" />
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-3">
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
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">无限经典探索</h2>
            <p className="text-sm text-gray-600 mt-1">在思想的海洋中自由航行</p>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode Selector */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                图谱
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                列表
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'timeline'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                时间轴
              </button>
            </div>

            {/* Close Button */}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'graph' && renderGraphView()}
          {viewMode === 'list' && renderListView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>共 {nodes.length} 个探索节点</span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setExpandedNodes(new Set(nodes.map(n => n.id)))}
                className="hover:text-gray-900"
              >
                展开全部
              </button>
              <button
                onClick={() => setExpandedNodes(new Set())}
                className="hover:text-gray-900"
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