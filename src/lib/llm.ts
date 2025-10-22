import OpenAI from 'openai';
import axios from 'axios';
import { LLMProvider, StreamChunk } from '@/types';

export class LLMService {
  private provider: LLMProvider;
  private openai: OpenAI | null = null;
  private apiKey: string;
  private baseURL: string;

  constructor() {
    this.provider = (process.env.ANNOTATE_MODEL || 'glm') as LLMProvider;

    // 根据配置选择提供商
    if (this.provider === 'gpt') {
      this.apiKey = process.env.OPENAI_API_KEY || '';
      this.baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      this.openai = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
    } else if (this.provider === 'glm') {
      this.apiKey = process.env.ZHIPU_API_KEY || '';
      this.baseURL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    } else if (this.provider === 'qwen') {
      this.apiKey = process.env.DASHSCOPE_API_KEY || '';
      this.baseURL = 'https://dashscope.aliyuncs.com/api/v1';
    }
  }

  private getPromptTemplate(type: 'annotate' | 'link' | 'expand'): string {
    switch (type) {
      case 'annotate':
        return `你是一位精通《六经》的AI注释者。
请为给定的现代句子和经文生成两段互注，语言简洁而有哲理：

【六经注我】——从经文角度回应现代句子（80-120字）
【我注六经】——从现代句子角度反观经文（80-120字）

输入：
现代句子：{{query}}
经文片段：{{passage}}

请按以下JSON格式返回：
{
  "six_to_me": "经文如何映照现代句子",
  "me_to_six": "现代句子如何回应经文"
}`;

      case 'link':
        return `请判断两个文本的关系类型，返回"semantic"（语义相似）、"contrast"（对比）、或"symbolic"（象征/隐喻）。
并附上一句简短理由。

输入：
句1：{{query}}
句2：{{passage}}

请按以下JSON格式返回：
{
  "reason": "semantic|contrast|symbolic",
  "evidence": "简要理由"
}`;

      case 'expand':
        return `你是古典文本索引助手。
输入一句现代汉语，输出3~5个关键词或短语，用于匹配儒释道经典原文。
保持文义、象征和比喻层面的一致性。

输入：{{query}}

请按以下JSON格式返回：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "semantic_terms": ["概念1", "概念2"]
}`;

      default:
        return '';
    }
  }

  async callLLM(prompt: string, stream: boolean = false): Promise<any> {
    const timeout = parseInt(process.env.TIMEOUT_MS || '20000');

    try {
      if (this.provider === 'gpt' && this.openai) {
        if (stream) {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            temperature: 0.7
          });
          return response;
        } else {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          });
          return response.choices[0].message.content;
        }
      } else if (this.provider === 'glm') {
        const response = await axios.post(
          `${this.baseURL}/chat/completions`,
          {
            model: 'glm-4',
            messages: [{ role: 'user', content: prompt }],
            stream,
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout,
            responseType: stream ? 'stream' : 'json'
          }
        );
        return response.data;
      } else if (this.provider === 'qwen') {
        const response = await axios.post(
          `${this.baseURL}/services/aigc/text-generation/generation`,
          {
            model: 'qwen-turbo',
            input: { messages: [{ role: 'user', content: prompt }] },
            parameters: { temperature: 0.7, result_format: 'message' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout
          }
        );
        return response.data.output.choices[0].message.content;
      }
    } catch (error: any) {
      console.error('[LLM] API call failed:', error.response?.data || error.message);
      throw new Error(`LLM API call failed: ${error.message}`);
    }
  }

  async generateAnnotation(query: string, passage: string): Promise<{
    six_to_me: string;
    me_to_six: string;
    reason: string;
    links: Array<{ to_passage: string; score: number }>;
  }> {
    // 生成注释
    const annotatePrompt = this.getPromptTemplate('annotate')
      .replace('{{query}}', query)
      .replace('{{passage}}', passage);

    const annotateResponse = await this.callLLM(annotatePrompt);
    let annotation: { six_to_me: string; me_to_six: string };

    try {
      annotation = JSON.parse(annotateResponse);
    } catch (e) {
      // 尝试提取JSON
      const jsonMatch = annotateResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        annotation = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid annotation response format');
      }
    }

    // 生成链接关系
    const linkPrompt = this.getPromptTemplate('link')
      .replace('{{query}}', query)
      .replace('{{passage}}', passage);

    const linkResponse = await this.callLLM(linkPrompt);
    let linkData: { reason: string; evidence: string };

    try {
      linkData = JSON.parse(linkResponse);
    } catch (e) {
      const jsonMatch = linkResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        linkData = JSON.parse(jsonMatch[0]);
      } else {
        linkData = { reason: 'semantic', evidence: '语义相似' };
      }
    }

    // 生成模拟链接（实际应用中可以从数据库查找）
    const links = [
      { to_passage: 'LJ_041', score: 0.62 },
      { to_passage: 'MZ_102', score: 0.55 }
    ];

    return {
      six_to_me: annotation.six_to_me,
      me_to_six: annotation.me_to_six,
      reason: linkData.reason,
      links
    };
  }

  async *streamAnnotation(query: string, passage: string): AsyncGenerator<StreamChunk> {
    const prompt = this.getPromptTemplate('annotate')
      .replace('{{query}}', query)
      .replace('{{passage}}', passage);

    try {
      if (this.provider === 'glm') {
        const response = await this.callLLM(prompt, true);
        let buffer = '';

        for await (const chunk of response) {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices?.[0]?.delta?.content) {
                  yield {
                    type: 'chunk',
                    data: { content: parsed.choices[0].delta.content }
                  };
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      } else {
        // 对于不支持流式的API，模拟流式输出
        const response = await this.callLLM(prompt);
        const result = JSON.parse(response);

        // 分块输出
        const chunks = [
          { type: 'chunk', data: { six_to_me: result.six_to_me } },
          { type: 'chunk', data: { me_to_six: result.me_to_six } }
        ];

        for (const chunk of chunks) {
          yield chunk;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 发送元数据
      yield {
        type: 'meta',
        data: {
          reason: 'semantic',
          links: [{ to_passage: 'LJ_041', score: 0.62 }]
        }
      };

      // 结束
      yield { type: 'end', data: null };
    } catch (error: any) {
      yield {
        type: 'chunk',
        data: { error: error.message }
      };
    }
  }

  async expandQuery(query: string): Promise<{
    keywords: string[];
    semantic_terms: string[];
  }> {
    const prompt = this.getPromptTemplate('expand').replace('{{query}}', query);
    const response = await this.callLLM(prompt);

    try {
      return JSON.parse(response);
    } catch (e) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {
        keywords: [query],
        semantic_terms: []
      };
    }
  }

  getProvider(): LLMProvider {
    return this.provider;
  }
}

// 导出单例实例
export const llmService = new LLMService();