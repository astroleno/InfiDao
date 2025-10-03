import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';
import type { GraphNode } from '@/shared/types';
import { getAIService } from '@/shared/api/ai';

interface NodeDetailViewProps {
  node: GraphNode;
}

export const NodeDetailView: React.FC<NodeDetailViewProps> = ({ node }) => {
  const { setContentMode, setWikiTopic, addToHistory, setStreamingText } = useAppStore();
  const [interpretation, setInterpretation] = React.useState(node.interpretation || '');

  const handleWordClick = (word: string) => {
    setContentMode('wiki-explore');
    setWikiTopic(word);

    addToHistory({
      id: `nav-${Date.now()}`,
      type: 'wiki',
      timestamp: Date.now(),
      wikiData: {
        topic: word,
        fromNode: node.id,
        depth: 1,
      },
    });
  };

  React.useEffect(() => {
    if (!interpretation) {
      // Generate interpretation if not exists
      const generateInterpretation = async () => {
        try {
          const aiService = getAIService();
          const prompt = `请为以下儒释道概念生成简洁的现代释义（120-180字）：

概念：${node.label}
原文：${node.originalText}
出处：${node.reference}
学派：${node.category}

要求：
1. 字数：120-180字
2. 结构：2-3个自然段
3. 语言：简洁通俗，面向普通读者
4. 格式：纯文本，不使用Markdown`;

          const result = await aiService.generateText(prompt);
          setInterpretation(result);
        } catch (error) {
          console.error('Failed to generate interpretation:', error);
          setInterpretation('释义生成失败，请稍后重试。');
        }
      };

      generateInterpretation();
    }
  }, [node, interpretation]);

  // Make text clickable
  const renderClickableText = (text: string) => {
    const words = text.split(/([，。、；：""''！？\s]+)/);
    return words.map((word, index) => {
      if (word.trim() && word.length > 1 && !/[，。、；：""''！？\s]/.test(word)) {
        return (
          <span
            key={index}
            className="clickable-word"
            onClick={() => handleWordClick(word)}
          >
            {word}
          </span>
        );
      }
      return <span key={index}>{word}</span>;
    });
  };

  return (
    <div className="node-detail-view">
      <h2>{node.label}</h2>

      <section className="classic-text">
        <h3>📜 经典原文</h3>
        <blockquote>{node.originalText}</blockquote>
        {node.fullQuote && <p className="full-quote">{node.fullQuote}</p>}
        <cite>📖 {node.reference}</cite>
      </section>

      <section className="ai-interpretation">
        <h3>🤖 AI释义</h3>
        <div className="interpretation-text">
          {interpretation ? renderClickableText(interpretation) : '生成中...'}
        </div>
      </section>

      <section className="recommendations">
        <h3>🔗 继续探索</h3>
        <div className="recommendation-cards">
          {node.metadata.relatedConcepts.slice(0, 3).map((conceptId) => (
            <div key={conceptId} className="recommendation-card">
              <p>{conceptId}</p>
              <span>相关概念</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
