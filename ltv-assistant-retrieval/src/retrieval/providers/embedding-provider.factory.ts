/**
 * Embedding Provider Factory
 * Multi-provider support: Ollama, OpenAI, Google
 * Pattern: ltv-assistant-indexing/src/indexing/stages/embed/embedding-provider.factory.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import type { Embeddings } from '@langchain/core/embeddings';
import type { EmbeddingProvider } from './types';

@Injectable()
export class EmbeddingProviderFactory {
  private readonly logger = new Logger(EmbeddingProviderFactory.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create embedding model based on configuration
   */
  createEmbeddingModel(): Embeddings {
    const provider = this.getProvider();
    const model = this.getModel(provider);

    this.logger.log(
      `Creating embedding model: ${provider}/${model} (${this.getEmbeddingDimensions()}D)`,
    );

    switch (provider) {
      case 'ollama':
        return this.createOllamaEmbeddings(model);
      case 'openai':
        return this.createOpenAIEmbeddings(model);
      case 'google':
        return this.createGoogleEmbeddings(model);
    }
  }

  /**
   * Get embedding dimensions for current provider
   */
  getEmbeddingDimensions(): number {
    const provider = this.getProvider();
    const model = this.getModel(provider);

    // Dimension mapping for all supported models
    const dimensionMap: Record<string, number> = {
      // Ollama models
      'bge-m3:567m': 1024,
      'bge-m3': 1024,
      // OpenAI
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
      // Google
      'text-embedding-004': 1024,
      'embedding-001': 1024,
    };

    return dimensionMap[model] || 1024; // Default to 1024D
  }

  /**
   * Get provider from config (default: ollama)
   */
  private getProvider(): EmbeddingProvider {
    const provider = this.configService.get<string>(
      'EMBEDDING_PROVIDER',
      'ollama',
    );

    if (
      provider !== 'ollama' &&
      provider !== 'openai' &&
      provider !== 'google'
    ) {
      this.logger.warn(
        `Invalid embedding provider: ${provider}, defaulting to ollama`,
      );
      return 'ollama';
    }

    return provider as EmbeddingProvider;
  }

  /**
   * Get model based on provider
   */
  private getModel(provider: EmbeddingProvider): string {
    const defaultModels: Record<EmbeddingProvider, string> = {
      ollama: 'bge-m3:567m',
      openai: 'text-embedding-3-small',
      google: 'text-embedding-004',
    };

    // Provider-specific env vars
    const envVars: Record<EmbeddingProvider, string> = {
      ollama: 'OLLAMA_EMBEDDING_MODEL',
      openai: 'OPENAI_EMBEDDING_MODEL',
      google: 'GOOGLE_EMBEDDING_MODEL',
    };

    return this.configService.get<string>(
      envVars[provider],
      defaultModels[provider],
    );
  }

  /**
   * Create Ollama embeddings
   */
  private createOllamaEmbeddings(model: string): OllamaEmbeddings {
    const baseUrl = this.configService.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );

    return new OllamaEmbeddings({
      model,
      baseUrl,
    });
  }

  /**
   * Create OpenAI embeddings
   */
  private createOpenAIEmbeddings(model: string): OpenAIEmbeddings {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI embeddings');
    }

    return new OpenAIEmbeddings({
      model,
      openAIApiKey: apiKey,
    });
  }

  /**
   * Create Google embeddings
   */
  private createGoogleEmbeddings(model: string): GoogleGenerativeAIEmbeddings {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');

    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Google embeddings');
    }

    return new GoogleGenerativeAIEmbeddings({
      model,
      apiKey,
    });
  }
}
