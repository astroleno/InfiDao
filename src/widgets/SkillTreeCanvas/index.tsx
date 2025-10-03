import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';
import type { GraphNode } from '@/shared/types';

interface SkillTreeCanvasProps {
  onNodeClick?: (node: GraphNode) => void;
}

export const SkillTreeCanvas: React.FC<SkillTreeCanvasProps> = ({ onNodeClick }) => {
  const { nodes, edges, unlocked, currentNode } = useAppStore((state) => state.skillTree);

  const handleNodeClick = (node: GraphNode) => {
    useAppStore.getState().unlockNode(node.id);
    useAppStore.getState().setCurrentNode(node.id);
    useAppStore.getState().setNodeData(node);
    useAppStore.getState().setContentMode('node-detail');

    // Add to navigation history
    useAppStore.getState().addToHistory({
      id: `nav-${Date.now()}`,
      type: 'skill-tree',
      timestamp: Date.now(),
      nodeData: {
        nodeId: node.id,
        nodeName: node.label,
        category: node.category,
      },
    });

    onNodeClick?.(node);
  };

  return (
    <div className="skill-tree-canvas" data-testid="skill-tree-canvas">
      <div className="nodes-container">
        {nodes.map((node) => (
          <div
            key={node.id}
            data-node-id={node.id}
            className={`node ${unlocked.has(node.id) ? 'unlocked' : 'locked'} ${
              currentNode === node.id ? 'active' : ''
            }`}
            style={{
              position: 'absolute',
              left: node.position.x,
              top: node.position.y,
            }}
            onClick={() => handleNodeClick(node)}
          >
            <div className="node-icon">{node.label}</div>
            <div className="node-category">{node.category}</div>
          </div>
        ))}
      </div>

      <div className="edges-container">
        {edges.map((edge) => (
          <div key={edge.id} className="edge" data-edge-id={edge.id}>
            {/* Edge rendering will be enhanced with React Flow or SVG */}
          </div>
        ))}
      </div>

      <div className="canvas-info">
        <p>Nodes: {nodes.length}</p>
        <p>Unlocked: {unlocked.size}</p>
      </div>
    </div>
  );
};
