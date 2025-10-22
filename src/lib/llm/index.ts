/**
 * LLM Adapter Service
 *
 * Provides a unified interface for multiple LLM providers
 * including OpenAI, GLM, Qwen, and others.
 */

import { z } from 'zod';
import { llmConfig, getActiveLLMProvider } from '@/lib/config';
import type { LLMProvider, LLMResponse, AnnotateRequest } from '@/types';

// LLM Adapter interface
export interface LLMAdapter {
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  stream(prompt: string, options?: LLMOptions): AsyncGenerator<string, void, unknown>;
  isConfigured(): boolean;
  getName(): string;
  getModel(): string;
}

// LLM options
export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  systemPrompt?: string;
}

// OpenAI Adapter
export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4-turbo-preview';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getName(): string {
    return 'OpenAI';
  }

  getModel(): string {
    return this.model;
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: this.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: false,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        usage: data.usage,
        model: data.model,
        finish_reason: data.choices[0].finish_reason,
      };
    } catch (error) {
      console.error('OpenAI completion error:', error);
      throw error;
    }
  }

  async *stream(prompt: string, options: LLMOptions = {}): AsyncGenerator<string, void, unknown> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: this.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch (e) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('OpenAI stream error:', error);
      throw error;
    }
  }
}

// GLM Adapter (Zhipu AI)
export class GLMAdapter implements LLMAdapter {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = config.model || 'glm-4';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getName(): string {
    return 'GLM';
  }

  getModel(): string {
    return this.model;
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: this.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      stream: false,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`GLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0].message.content,
        usage: data.usage,
        model: data.model,
        finish_reason: data.choices[0].finish_reason,
      };
    } catch (error) {
      console.error('GLM completion error:', error);
      throw error;
    }
  }

  async *stream(prompt: string, options: LLMOptions = {}): AsyncGenerator<string, void, unknown> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: this.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`GLM API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch (e) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('GLM stream error:', error);
      throw error;
    }
  }
}

// Qwen Adapter (Alibaba Cloud)
export class QwenAdapter implements LLMAdapter {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: { apiKey: string; baseURL?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://dashscope.aliyuncs.com/api/v1';
    this.model = config.model || 'qwen-max';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getName(): string {
    return 'Qwen';
  }

  getModel(): string {
    return this.model;
  }

  async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const body = {
      model: this.model,
      input: {
        messages: [
          ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ],
      },
      parameters: {
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        repetition_penalty: options.frequencyPenalty,
        stop: options.stopSequences,
        incremental_output: false,
      },
    };

    try {
      const response = await fetch(`${this.baseURL}/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.code !== '200') {
        throw new Error(`Qwen API error: ${data.message}`);
      }

      return {
        content: data.output.text,
        usage: {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.total_tokens,
        },
        model: this.model,
        finish_reason: data.output.finish_reason,
      };
    } catch (error) {
      console.error('Qwen completion error:', error);
      throw error;
    }
  }

  async *stream(prompt: string, options: LLMOptions = {}): AsyncGenerator<string, void, unknown> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable',
    };

    const body = {
      model: this.model,
      input: {
        messages: [
          ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ],
      },
      parameters: {
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        repetition_penalty: options.frequencyPenalty,
        stop: options.stopSequences,
        incremental_output: true,
      },
    };

    try {
      const response = await fetch(`${this.baseURL}/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              if (parsed.output && parsed.output.text) {
                yield parsed.output.text;
              }
            } catch (e) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Qwen stream error:', error);
      throw error;
    }
  }
}

// LLM Manager
export class LLMManager {
  private adapters: Map<LLMProvider, LLMAdapter> = new Map();
  private defaultProvider: LLMProvider;

  constructor() {
    this.defaultProvider = getActiveLLMProvider();
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // Initialize OpenAI adapter
    if (llmConfig.providers.openai.apiKey) {
      this.adapters.set('openai', new OpenAIAdapter(llmConfig.providers.openai));
    }

    // Initialize GLM adapter
    if (llmConfig.providers.glm.apiKey) {
      this.adapters.set('glm', new GLMAdapter(llmConfig.providers.glm));
    }

    // Initialize Qwen adapter
    if (llmConfig.providers.qwen.apiKey) {
      this.adapters.set('qwen', new QwenAdapter(llmConfig.providers.qwen));
    }
  }

  getAdapter(provider?: LLMProvider): LLMAdapter {
    const selectedProvider = provider || this.defaultProvider;
    const adapter = this.adapters.get(selectedProvider);

    if (!adapter) {
      throw new Error(`LLM adapter for provider '${selectedProvider}' is not configured`);
    }

    return adapter;
  }

  async complete(prompt: string, options?: LLMOptions, provider?: LLMProvider): Promise<LLMResponse> {
    const adapter = this.getAdapter(provider);
    return adapter.complete(prompt, options);
  }

  async *stream(prompt: string, options?: LLMOptions, provider?: LLMProvider): AsyncGenerator<string, void, unknown> {
    const adapter = this.getAdapter(provider);
    yield* adapter.stream(prompt, options);
  }

  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.adapters.keys()).filter(provider =>
      this.adapters.get(provider)?.isConfigured()
    );
  }

  isProviderConfigured(provider: LLMProvider): boolean {
    const adapter = this.adapters.get(provider);
    return adapter?.isConfigured() || false;
  }
}

// Singleton instance
let llmManager: LLMManager | null = null;

// Get LLM manager instance
export function getLLMManager(): LLMManager {
  if (!llmManager) {
    llmManager = new LLMManager();
  }
  return llmManager;
}

// Annotation prompt templates
export const annotationPrompts = {
  systemPrompt: `你是一位精通中国古典文化的学者，专门研究六经（《诗经》《尚书》《礼记》《易经》《春秋》《乐经》）。
你的任务是帮助用户理解他们的思考，并将其与六经的智慧联系起来。

请遵循以下原则：
1. 理解用户输入的核心思想和情感
2. 从六经中找到相关的经文段落
3. 分析经文与用户思考的关联性
4. 以"六经注我"的方式解释：如何用古人的智慧启发现代思考
5. 以"我注六经"的方式解释：现代思考如何帮助我们理解古人的智慧

输出格式：
{
  "summary": "简要总结用户的思考",
  "related_passages": [
    {
      "source": "经书名称",
      "chapter": "篇章",
      "text": "经文内容",
      "relevance": "关联性说明",
      "score": 0.95
    }
  ],
  "six_to_me": "六经如何启发我的思考",
  "me_to_six": "我的思考如何帮助理解六经",
  "links": [
    {
      "from_passage": "引用的经文",
      "to_passage": "关联的其他经文",
      "relationship": "关联类型"
    }
  ]
}`,

  userPromptTemplate: (note: string, context?: string) =>
    `用户笔记：${note}

${context ? `上下文信息：${context}` : ''}

请分析这段思考，并从六经中找到相关的智慧来启发和理解。`,
};

// Utility functions
export const llmUtils = {
  // Extract JSON from LLM response
  extractJSON(response: string): any {
    try {
      // Try to parse the entire response as JSON
      return JSON.parse(response);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Still failed, return null
        }
      }

      // Try to find JSON object in the text
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Still failed
        }
      }

      // Return null if no valid JSON found
      return null;
    }
  },

  // Generate annotation with LLM
  async generateAnnotation(
    note: string,
    context?: string,
    style: 'academic' | 'poetic' | 'modern' | 'classical' = 'modern'
  ): Promise<any> {
    const manager = getLLMManager();

    const stylePrompts = {
      academic: '请使用学术性的语言风格进行分析',
      poetic: '请使用诗意的语言风格进行表达',
      modern: '请使用现代易懂的语言风格',
      classical: '请使用文言文风格进行解释'
    };

    const prompt = annotationPrompts.userPromptTemplate(note, context);
    const systemPrompt = `${annotationPrompts.systemPrompt}\n\n${stylePrompts[style]}`;

    try {
      const response = await manager.complete(prompt, {
        systemPrompt,
        maxTokens: 2000,
        temperature: 0.7,
      });

      return llmUtils.extractJSON(response.content);
    } catch (error) {
      console.error('Failed to generate annotation:', error);
      throw error;
    }
  },

  // Check if LLM is available
  async checkLLMAvailability(): Promise<{
    available: boolean;
    providers: LLMProvider[];
    activeProvider: LLMProvider;
  }> {
    const manager = getLLMManager();
    const providers = manager.getAvailableProviders();

    return {
      available: providers.length > 0,
      providers,
      activeProvider: providers[0] || 'openai',
    };
  },
};