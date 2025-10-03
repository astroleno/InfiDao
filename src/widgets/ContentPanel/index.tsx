import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';
import { NodeDetailView } from './NodeDetailView';
import { WikiExploreView } from './WikiExploreView';

export const ContentPanel: React.FC = () => {
  const { mode, nodeData, wikiTopic, isLoading, error } = useAppStore((state) => state.content);

  if (!nodeData && mode === 'node-detail') {
    return (
      <div className="content-panel empty">
        <p>请点击技能树中的节点查看详情</p>
      </div>
    );
  }

  return (
    <div className={`content-panel ${mode}`}>
      <div className="mode-indicator">
        {mode === 'node-detail' ? (
          <>
            <span className="icon">📜</span>
            <span className="label">节点详情</span>
          </>
        ) : (
          <>
            <span className="icon">🌀</span>
            <span className="label">Wiki探索</span>
          </>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {mode === 'node-detail' && nodeData && (
        <NodeDetailView node={nodeData} />
      )}

      {mode === 'wiki-explore' && wikiTopic && (
        <WikiExploreView topic={wikiTopic} />
      )}

      {isLoading && (
        <div className="loading-indicator">
          <span>⏳</span>
          <p>加载中...</p>
        </div>
      )}
    </div>
  );
};
