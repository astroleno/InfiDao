import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';
import { SkillTreeCanvas } from '@/widgets/SkillTreeCanvas';
import { ContentPanel } from '@/widgets/ContentPanel';
import { ProgressPanel } from '@/widgets/ProgressPanel';
import './MainPage.css';

export const MainPage: React.FC = () => {
  const { setNodes, setEdges } = useAppStore();

  React.useEffect(() => {
    // Load data from JSON files
    const loadData = async () => {
      try {
        const [nodesResponse, edgesResponse] = await Promise.all([
          fetch('/data/nodes.json'),
          fetch('/data/edges.json'),
        ]);

        const nodes = await nodesResponse.json();
        const edges = await edgesResponse.json();

        setNodes(nodes);
        setEdges(edges);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, [setNodes, setEdges]);

  return (
    <div className="main-page">
      <header className="app-header">
        <h1>InfiDao</h1>
        <p className="subtitle">儒释道技能树 + 无限探索</p>
      </header>

      <div className="main-content">
        <aside className="sidebar-left">
          <ProgressPanel />
        </aside>

        <main className="center-content">
          <div className="skill-tree-section">
            <SkillTreeCanvas />
          </div>
        </main>

        <aside className="sidebar-right">
          <ContentPanel />
        </aside>
      </div>

      <footer className="app-footer">
        <p>InfiDao v0.1.0 | Powered by Gemini AI</p>
      </footer>
    </div>
  );
};
