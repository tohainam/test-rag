/**
 * LLM Provider Factory
 * Creates LLM instances from multiple providers (OpenAI, Google, Anthropic, Ollama)
 * Pattern: ltv-assistant-indexing/src/indexing/stages/enrich/services/llm-provider.factory.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider, ChatModelOptions } from './types';

@Injectable()
export class LLMProviderFactory {
  private readonly logger = new Logger(LLMProviderFactory.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create chat model based on provider
   * @param provider - Provider name (openai, google, anthropic, ollama)
   * @param options - Optional override options (model, temperature, maxTokens, maxRetries)
   * @returns BaseChatModel instance
   */
  createChatModel(
    provider?: LLMProvider,
    options?: ChatModelOptions,
  ): BaseChatModel {
    const selectedProvider =
      provider ||
      (this.configService.get<LLMProvider>('LLM_PROVIDER') as LLMProvider) ||
      'ollama';

    this.logger.log(`Creating chat model for provider: ${selectedProvider}`);

    switch (selectedProvider) {
      case 'openai':
        return this.createOpenAIModel(options);

      case 'google':
        return this.createGoogleModel(options);

      case 'anthropic':
        return this.createAnthropicModel(options) as unknown as BaseChatModel;

      case 'ollama':
      default:
        return this.createOllamaModel(options);
    }
  }

  /**
   * Create OpenAI chat model
   */
  private createOpenAIModel(options?: ChatModelOptions): ChatOpenAI {
    const model =
      options?.model ||
      this.configService.get<string>('OPENAI_CHAT_MODEL') ||
      'gpt-4o';

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }

    return new ChatOpenAI({
      model,
      temperature: options?.temperature ?? 0.3,
      maxTokens: options?.maxTokens ?? 100,
      maxRetries: options?.maxRetries ?? 2,
      configuration: {
        baseURL:
          this.configService.get<string>('OPENAI_BASE_URL') ||
          'https://api.openai.com/v1',
        apiKey,
      },
    });
  }

  /**
   * Create Google Gemini chat model
   */
  private createGoogleModel(
    options?: ChatModelOptions,
  ): ChatGoogleGenerativeAI {
    const model =
      options?.model ||
      this.configService.get<string>('GOOGLE_CHAT_MODEL') ||
      'gemini-2.5-flash-lite';

    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Google provider');
    }

    return new ChatGoogleGenerativeAI({
      model,
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 100,
      maxRetries: options?.maxRetries ?? 2,
      apiKey,
    });
  }

  /**
   * Create Anthropic Claude chat model
   */
  private createAnthropicModel(options?: ChatModelOptions): ChatAnthropic {
    const model =
      options?.model ||
      this.configService.get<string>('ANTHROPIC_CHAT_MODEL') ||
      'claude-sonnet-4-5-20250929';

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }

    return new ChatAnthropic({
      model,
      temperature: options?.temperature ?? 0.3,
      maxTokens: options?.maxTokens ?? 100,
      maxRetries: options?.maxRetries ?? 2,
      apiKey,
    });
  }

  /**
   * Create Ollama chat model (local)
   */
  private createOllamaModel(options?: ChatModelOptions): ChatOllama {
    const model =
      options?.model ||
      this.configService.get<string>('OLLAMA_CHAT_MODEL') ||
      'gemma3:1b';

    return new ChatOllama({
      model,
      temperature: options?.temperature ?? 0.3,
      numPredict: options?.maxTokens ?? 100,
      baseUrl:
        this.configService.get<string>('OLLAMA_BASE_URL') ||
        'http://localhost:11434',
    });
  }
}
