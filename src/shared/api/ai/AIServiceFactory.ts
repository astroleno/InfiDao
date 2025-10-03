import type { LLMProvider, AIServiceConfig } from './types';
import { GeminiAdapter } from './GeminiAdapter';

export class AIServiceFactory {
  static create(config: AIServiceConfig): LLMProvider {
    switch (config.provider) {
      case 'gemini':
        return new GeminiAdapter(config.apiKey, config.model);

      case 'openai':
        // TODO: Implement OpenAI adapter
        throw new Error('OpenAI adapter not yet implemented');

      case 'claude':
        // TODO: Implement Claude adapter
        throw new Error('Claude adapter not yet implemented');

      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }
}

// Singleton instance
let aiServiceInstance: LLMProvider | null = null;

export function getAIService(): LLMProvider {
  if (!aiServiceInstance) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const provider = (import.meta.env.VITE_AI_PROVIDER || 'gemini') as AIServiceConfig['provider'];

    if (!apiKey) {
      throw new Error('AI API key not configured. Please set VITE_GEMINI_API_KEY in .env file');
    }

    aiServiceInstance = AIServiceFactory.create({
      provider,
      apiKey,
    });
  }

  return aiServiceInstance;
}
