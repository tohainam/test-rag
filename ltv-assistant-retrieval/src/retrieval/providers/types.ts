/**
 * Provider Types and Configurations
 */

/**
 * Embedding Provider Type
 */
export type EmbeddingProvider = 'ollama' | 'openai' | 'google';

/**
 * LLM Provider Type
 */
export type LLMProvider = 'openai' | 'google' | 'anthropic' | 'ollama';

/**
 * Embedding Provider Configuration
 */
export interface EmbeddingProviderConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  baseURL?: string;
  apiKey?: string;
}

/**
 * Chat Model Options
 */
export interface ChatModelOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}
