/**
 * Query Transformation Service
 * Implements 4 query transformation techniques for improved retrieval
 * Reference: PRD Section "Query Transformation Service" (Lines 654-847)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LLMProviderFactory } from '../providers/llm-provider.factory';
import type { LLMProvider } from '../providers/types';

interface TransformationConfig {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  timeout: number;
  fallbackEnabled: boolean;
  fallbackProvider: LLMProvider;
  fallbackModel: string;
}

@Injectable()
export class QueryTransformationService {
  private readonly logger = new Logger(QueryTransformationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly llmFactory: LLMProviderFactory,
  ) {}

  /**
   * Helper: Type guard to check if value is valid LLMProvider
   */
  private isLLMProvider(value: string): value is LLMProvider {
    return ['openai', 'google', 'anthropic', 'ollama'].includes(value);
  }

  /**
   * Helper: Validate and convert string to LLMProvider type
   */
  private validateLLMProvider(value: string | undefined): LLMProvider {
    if (value && this.isLLMProvider(value)) {
      return value;
    }
    return 'ollama'; // Safe default
  }

  /**
   * Helper: Get hardcoded default model for each provider
   */
  private getProviderDefaultModel(provider: LLMProvider): string {
    const defaults: Record<LLMProvider, string> = {
      google: 'gemini-2.5-flash-lite',
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-haiku-20241022',
      ollama: 'gemma3:1b',
    };
    return defaults[provider];
  }

  /**
   * Helper: Get transformation configuration from environment variables
   * @param transformationType - Type of transformation (REFORMULATION, REWRITE, HYDE, DECOMPOSITION)
   * @returns Configuration object with all settings
   */
  private getTransformationConfig(
    transformationType: 'REFORMULATION' | 'REWRITE' | 'HYDE' | 'DECOMPOSITION',
  ): TransformationConfig {
    const prefix = `QUERY_${transformationType}`;

    // Step 1: Determine provider first
    const providerValue =
      this.configService.get<string>(`${prefix}_PROVIDER`) ||
      this.configService.get<string>('LLM_PROVIDER') ||
      'ollama';
    const provider = this.validateLLMProvider(providerValue);

    // Step 2: Use provider-specific model fallback
    const providerChatModelKey = `${provider.toUpperCase()}_CHAT_MODEL`;
    const providerDefaultModel = this.getProviderDefaultModel(provider);

    // Step 3: Determine fallback provider
    const fallbackProviderValue =
      this.configService.get<string>(`${prefix}_FALLBACK_PROVIDER`) || 'ollama';
    const fallbackProvider = this.validateLLMProvider(fallbackProviderValue);

    // Step 4: Use fallback provider-specific model
    const fallbackProviderChatModelKey = `${fallbackProvider.toUpperCase()}_CHAT_MODEL`;
    const fallbackProviderDefaultModel =
      this.getProviderDefaultModel(fallbackProvider);

    return {
      provider,
      model:
        this.configService.get(`${prefix}_MODEL`) ||
        this.configService.get(providerChatModelKey) ||
        providerDefaultModel,
      temperature: parseFloat(
        this.configService.get(`${prefix}_TEMPERATURE`) || '0.7',
      ),
      maxTokens: parseInt(
        this.configService.get(`${prefix}_MAX_TOKENS`) || '200',
      ),
      maxRetries: parseInt(
        this.configService.get(`${prefix}_MAX_RETRIES`) || '2',
      ),
      timeout: parseInt(this.configService.get(`${prefix}_TIMEOUT`) || '10000'),
      fallbackEnabled:
        this.configService.get(`${prefix}_FALLBACK_ENABLED`) === 'true',
      fallbackProvider,
      fallbackModel:
        this.configService.get(`${prefix}_FALLBACK_MODEL`) ||
        this.configService.get(fallbackProviderChatModelKey) ||
        fallbackProviderDefaultModel,
    };
  }

  /**
   * Helper: Execute transformation with retry and fallback logic
   * @param transformationType - Name for logging
   * @param executeFn - Function that performs the actual transformation
   * @param config - Transformation configuration
   * @returns Result from executeFn or throws error after all retries
   */
  private async executeWithRetryAndFallback<T>(
    transformationType: string,
    executeFn: (
      provider: LLMProvider,
      model: string,
      temperature: number,
      maxTokens: number,
    ) => Promise<T>,
    config: TransformationConfig,
  ): Promise<T> {
    // Try main provider with retries
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          executeFn(
            config.provider,
            config.model,
            config.temperature,
            config.maxTokens,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), config.timeout),
          ),
        ]);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (attempt < config.maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt - 1);
          this.logger.warn(
            `[QueryTransformation] type=${transformationType} provider=${config.provider} model=${config.model} attempt=${attempt}/${config.maxRetries} status=retry backoff=${backoffMs}ms error=${errorMessage}`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        } else {
          this.logger.warn(
            `[QueryTransformation] type=${transformationType} provider=${config.provider} model=${config.model} attempt=${attempt}/${config.maxRetries} status=max_retries_reached error=${errorMessage}`,
          );
        }

        if (attempt === config.maxRetries) break;
      }
    }

    // Try fallback if enabled
    if (config.fallbackEnabled) {
      this.logger.log(
        `[QueryTransformation] type=${transformationType} fallback=triggered main_provider=${config.provider} main_model=${config.model} fallback_provider=${config.fallbackProvider} fallback_model=${config.fallbackModel}`,
      );
      try {
        return await executeFn(
          config.fallbackProvider,
          config.fallbackModel,
          config.temperature,
          config.maxTokens,
        );
      } catch (fallbackError) {
        const fallbackErrorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        this.logger.error(
          `[QueryTransformation] type=${transformationType} fallback=failed fallback_provider=${config.fallbackProvider} fallback_model=${config.fallbackModel} error=${fallbackErrorMessage}`,
        );
      }
    }

    throw new Error(
      `${transformationType} failed after ${config.maxRetries} retries`,
    );
  }

  /**
   * Method 1: Query Reformulation
   * Generate 3-5 variations of the query for improved recall
   * Uses QUERY_REFORMULATION_* configuration from .env
   */
  async reformulateQuery(query: string): Promise<string[]> {
    const config = this.getTransformationConfig('REFORMULATION');
    const startTime = Date.now();

    this.logger.log(
      `[QueryTransformation] type=REFORMULATION provider=${config.provider} model=${config.model} temp=${config.temperature} maxTokens=${config.maxTokens} status=starting`,
    );

    const executeFn = async (
      provider: LLMProvider,
      model: string,
      temperature: number,
      maxTokens: number,
    ): Promise<string[]> => {
      const chat = this.llmFactory.createChatModel(provider, {
        model,
        temperature,
        maxTokens,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are a query reformulation expert. Your task is to generate alternative phrasings of the user's query to improve search recall.

Rules:
1. Generate 3-5 variations of the query
2. Keep the original meaning and intent
3. Use synonyms, different word orders, and related terms
4. Return ONLY the reformulated queries, one per line
5. Do NOT include explanations or numbering

Example:
Input: "How to implement RAG with LangChain?"
Output:
LangChain RAG implementation guide
Building retrieval-augmented generation using LangChain
Steps for creating RAG pipeline with LangChain
LangChain RAG setup tutorial
Implementing retrieval augmented generation LangChain framework`,
        ],
        ['user', 'Original query: {query}\n\nReformulated queries:'],
      ]);

      const chain = prompt.pipe(chat).pipe(new StringOutputParser());
      const result = await chain.invoke({ query });

      // Parse output: split by newlines and filter empty lines
      const variations = result
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== query);

      return variations.slice(0, 5); // Take max 5 variations
    };

    try {
      const variations = await this.executeWithRetryAndFallback(
        'Query Reformulation',
        executeFn,
        config,
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[QueryTransformation] type=REFORMULATION provider=${config.provider} model=${config.model} status=success duration=${duration}ms variations=${variations.length}`,
      );

      return variations;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[QueryTransformation] type=REFORMULATION provider=${config.provider} model=${config.model} status=failed duration=${duration}ms error=${errorMessage}`,
      );
      return []; // Graceful fallback: no reformulations
    }
  }

  /**
   * Method 2: Query Rewrite
   * Rewrite query to make it clearer and more search-friendly
   * Uses QUERY_REWRITE_* configuration from .env
   */
  async rewriteQuery(query: string): Promise<string | null> {
    const config = this.getTransformationConfig('REWRITE');
    const startTime = Date.now();

    this.logger.log(
      `[QueryTransformation] type=REWRITE provider=${config.provider} model=${config.model} temp=${config.temperature} maxTokens=${config.maxTokens} status=starting`,
    );

    const executeFn = async (
      provider: LLMProvider,
      model: string,
      temperature: number,
      maxTokens: number,
    ): Promise<string> => {
      const chat = this.llmFactory.createChatModel(provider, {
        model,
        temperature,
        maxTokens,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Rewrite the query to make it clearer and more search-friendly. Expand abbreviations, make it explicit.`,
        ],
        ['user', 'Original query: {query}\n\nRewritten query:'],
      ]);

      const chain = prompt.pipe(chat).pipe(new StringOutputParser());
      const rewritten = await chain.invoke({ query });
      return rewritten.trim();
    };

    try {
      const cleaned = await this.executeWithRetryAndFallback(
        'Query Rewrite',
        executeFn,
        config,
      );

      const duration = Date.now() - startTime;
      const changed = cleaned !== query;
      this.logger.log(
        `[QueryTransformation] type=REWRITE provider=${config.provider} model=${config.model} status=success duration=${duration}ms changed=${changed}`,
      );
      return changed ? cleaned : null;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[QueryTransformation] type=REWRITE provider=${config.provider} model=${config.model} status=failed duration=${duration}ms error=${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Method 3: HyDE (Hypothetical Document Embeddings)
   * Generate a hypothetical answer to embed instead of the query
   * Uses HYDE_* configuration from .env
   */
  async generateHyDE(query: string): Promise<string | null> {
    const config = this.getTransformationConfig('HYDE');
    const startTime = Date.now();

    this.logger.log(
      `[QueryTransformation] type=HYDE provider=${config.provider} model=${config.model} temp=${config.temperature} maxTokens=${config.maxTokens} status=starting`,
    );

    const executeFn = async (
      provider: LLMProvider,
      model: string,
      temperature: number,
      maxTokens: number,
    ): Promise<string> => {
      const chat = this.llmFactory.createChatModel(provider, {
        model,
        temperature,
        maxTokens,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Generate a hypothetical answer to this question as if writing technical documentation. 2-3 sentences, be specific.`,
        ],
        ['user', 'Question: {query}\n\nHypothetical answer:'],
      ]);

      const chain = prompt.pipe(chat).pipe(new StringOutputParser());
      const hypothetical = await chain.invoke({ query });
      return hypothetical.trim();
    };

    try {
      const hypothetical = await this.executeWithRetryAndFallback(
        'HyDE Generation',
        executeFn,
        config,
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[QueryTransformation] type=HYDE provider=${config.provider} model=${config.model} status=success duration=${duration}ms chars=${hypothetical.length}`,
      );
      return hypothetical;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[QueryTransformation] type=HYDE provider=${config.provider} model=${config.model} status=failed duration=${duration}ms error=${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * Method 4: Query Decomposition
   * Break complex queries into 2-4 simpler sub-queries
   * Uses QUERY_DECOMPOSITION_* configuration from .env
   */
  async decomposeQuery(query: string): Promise<string[]> {
    // Skip if query is too simple
    if (query.length < 50) {
      this.logger.log(
        `[QueryTransformation] type=DECOMPOSITION status=skipped reason=query_too_short chars=${query.length}`,
      );
      return [];
    }

    const config = this.getTransformationConfig('DECOMPOSITION');
    const startTime = Date.now();

    this.logger.log(
      `[QueryTransformation] type=DECOMPOSITION provider=${config.provider} model=${config.model} temp=${config.temperature} maxTokens=${config.maxTokens} status=starting`,
    );

    const executeFn = async (
      provider: LLMProvider,
      model: string,
      temperature: number,
      maxTokens: number,
    ): Promise<string[]> => {
      const chat = this.llmFactory.createChatModel(provider, {
        model,
        temperature,
        maxTokens,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Break down complex queries into 2-4 simpler sub-queries. One per line, no numbering.`,
        ],
        ['user', 'Complex query: {query}\n\nSub-queries:'],
      ]);

      const chain = prompt.pipe(chat).pipe(new StringOutputParser());
      const result = await chain.invoke({ query });

      const subQueries = result
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== query)
        .slice(0, 4);

      return subQueries;
    };

    try {
      const subQueries = await this.executeWithRetryAndFallback(
        'Query Decomposition',
        executeFn,
        config,
      );

      const duration = Date.now() - startTime;
      this.logger.log(
        `[QueryTransformation] type=DECOMPOSITION provider=${config.provider} model=${config.model} status=success duration=${duration}ms subqueries=${subQueries.length}`,
      );
      return subQueries;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[QueryTransformation] type=DECOMPOSITION provider=${config.provider} model=${config.model} status=failed duration=${duration}ms error=${errorMessage}`,
      );
      return [];
    }
  }
}
