import React from 'react';
import { useAppStore } from '@/app/store/useAppStore';
import { getAIService } from '@/shared/api/ai';

interface WikiExploreViewProps {
  topic: string;
}

export const WikiExploreView: React.FC<WikiExploreViewProps> = ({ topic }) => {
  const { setStreamingText, backToSkillTree } = useAppStore();
  const [content, setContent] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);

  React.useEffect(() => {
    const generateDefinition = async () => {
      setIsGenerating(true);
      setContent('');

      try {
        const aiService = getAIService();
        const prompt = `请提供"${topic}"的简明定义（单段落，不使用markdown格式）。信息准确、语言通俗。`;

        let accumulated = '';
        for await (const chunk of aiService.generateStream(prompt)) {
          accumulated += chunk;
          setContent(accumulated);
          setStreamingText(accumulated);
        }
      } catch (error) {
        console.error('Failed to generate definition:', error);
        setContent('定义生成失败，请稍后重试。');
      } finally {
        setIsGenerating(false);
      }
    };

    generateDefinition();
  }, [topic, setStreamingText]);

  return (
    <div className="wiki-explore-view">
      <div className="wiki-header">
        <button className="back-button" onClick={backToSkillTree}>
          ← 返回技能树
        </button>
        <h2>{topic}</h2>
      </div>

      <div className="wiki-content">
        {isGenerating && !content && <p className="generating">正在生成定义...</p>}
        {content && (
          <div className="definition-text">
            {content}
            {isGenerating && <span className="cursor">▊</span>}
          </div>
        )}
      </div>
    </div>
  );
};
