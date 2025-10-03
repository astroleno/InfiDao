import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';

export const ProgressPanel: React.FC = () => {
  const { nodes, unlocked } = useAppStore((state) => state.skillTree);

  const totalNodes = nodes.length;
  const unlockedCount = unlocked.size;
  const progress = totalNodes > 0 ? (unlockedCount / totalNodes) * 100 : 0;

  const nodesByCategory = React.useMemo(() => {
    const counts = {
      儒家: { total: 0, unlocked: 0 },
      道家: { total: 0, unlocked: 0 },
      佛家: { total: 0, unlocked: 0 },
    };

    nodes.forEach((node) => {
      counts[node.category].total++;
      if (unlocked.has(node.id)) {
        counts[node.category].unlocked++;
      }
    });

    return counts;
  }, [nodes, unlocked]);

  return (
    <div className="progress-panel">
      <h3>探索进度</h3>

      <div className="overall-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-text">
          {unlockedCount} / {totalNodes} 节点已点亮 ({progress.toFixed(0)}%)
        </p>
      </div>

      <div className="category-progress">
        {Object.entries(nodesByCategory).map(([category, counts]) => {
          const categoryProgress =
            counts.total > 0 ? (counts.unlocked / counts.total) * 100 : 0;

          return (
            <div key={category} className="category-item">
              <label>{category}</label>
              <div className="progress-bar small">
                <div
                  className="progress-fill"
                  style={{ width: `${categoryProgress}%` }}
                />
              </div>
              <span className="count">
                {counts.unlocked}/{counts.total}
              </span>
            </div>
          );
        })}
      </div>

      <div className="recent-activity">
        <h4>最近探索</h4>
        <p className="placeholder">暂无历史记录</p>
      </div>
    </div>
  );
};
