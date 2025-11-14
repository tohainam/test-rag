/**
 * Algorithmic Entity Extractor Service
 * Extracts named entities using pattern matching and NLP libraries (no LLM)
 * Based on specs from docs/plans/enrich-stage.md - ĐC-2
 */

import { Injectable, Logger } from '@nestjs/common';
import nlp from 'compromise';
import type { Entity, EntityType } from '../types';

@Injectable()
export class AlgorithmicEntityExtractorService {
  private readonly logger = new Logger(AlgorithmicEntityExtractorService.name);

  // Regex patterns for structured entities
  private readonly EMAIL_REGEX =
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private readonly URL_REGEX =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
  private readonly PHONE_REGEX = /\+?[\d\s\-()]{10,}/g;
  private readonly DATE_REGEX =
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi;
  private readonly MONEY_REGEX =
    /\$[\d,]+(\.\d{2})?|\d+\s?(USD|EUR|GBP|JPY|CNY)/gi;
  private readonly PERCENT_REGEX = /\d+(\.\d+)?%/g;
  private readonly PROPER_NOUN_REGEX = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

  /**
   * Extract all entities from text content
   * @param content - Text content to analyze
   * @returns Array of extracted entities
   */
  extractEntities(content: string): Entity[] {
    try {
      const entities: Entity[] = [];

      // 1. Pattern-based extraction (regex)
      entities.push(...this.extractEmails(content));
      entities.push(...this.extractUrls(content));
      entities.push(...this.extractPhones(content));
      entities.push(...this.extractDates(content));
      entities.push(...this.extractMoney(content));
      entities.push(...this.extractPercents(content));

      // 2. NLP-based extraction (compromise.js)
      entities.push(...this.extractNlpEntities(content));

      // 3. Deduplicate by text and type
      const deduplicated = this.deduplicateEntities(entities);

      this.logger.log(
        `Extracted ${deduplicated.length} entities from ${content.length} chars`,
      );

      return deduplicated;
    } catch (error) {
      this.logger.error('Entity extraction failed:', error);
      return []; // Graceful degradation
    }
  }

  /**
   * Extract email addresses
   */
  private extractEmails(content: string): Entity[] {
    const matches = content.match(this.EMAIL_REGEX) || [];

    return matches.map((text: string) => ({
      type: 'EMAIL' as EntityType,
      text,
      confidence: 1.0, // High confidence for regex
    }));
  }

  /**
   * Extract URLs
   */
  private extractUrls(content: string): Entity[] {
    const matches = content.match(this.URL_REGEX) || [];

    return matches.map((text: string) => ({
      type: 'URL' as EntityType,
      text,
      confidence: 1.0,
    }));
  }

  /**
   * Extract phone numbers
   */
  private extractPhones(content: string): Entity[] {
    const matches = content.match(this.PHONE_REGEX) || [];

    return matches
      .filter((text: string) => text.replace(/\D/g, '').length >= 10) // At least 10 digits
      .map((text: string) => ({
        type: 'PHONE' as EntityType,
        text,
        confidence: 0.8, // Medium confidence (false positives possible)
      }));
  }

  /**
   * Extract dates
   */
  private extractDates(content: string): Entity[] {
    const matches = content.match(this.DATE_REGEX) || [];

    return matches.map((text: string) => ({
      type: 'DATE' as EntityType,
      text,
      confidence: 0.9,
    }));
  }

  /**
   * Extract monetary values
   */
  private extractMoney(content: string): Entity[] {
    const matches = content.match(this.MONEY_REGEX) || [];

    return matches.map((text: string) => ({
      type: 'MONEY' as EntityType,
      text,
      confidence: 0.9,
    }));
  }

  /**
   * Extract percentages
   */
  private extractPercents(content: string): Entity[] {
    const matches = content.match(this.PERCENT_REGEX) || [];

    return matches.map((text: string) => ({
      type: 'PERCENT' as EntityType,
      text,
      confidence: 1.0,
    }));
  }

  /**
   * Extract NLP entities using compromise.js
   */
  private extractNlpEntities(content: string): Entity[] {
    const entities: Entity[] = [];

    try {
      const doc = nlp(content);

      // People
      const people = doc.people().out('array') as string[];
      people.forEach((text: string) => {
        entities.push({
          type: 'PERSON',
          text,
          confidence: 0.7, // NLP confidence varies
        });
      });

      // Places
      const places = doc.places().out('array') as string[];
      places.forEach((text: string) => {
        entities.push({
          type: 'LOCATION',
          text,
          confidence: 0.7,
        });
      });

      // Organizations
      const organizations = doc.organizations().out('array') as string[];
      organizations.forEach((text: string) => {
        entities.push({
          type: 'ORGANIZATION',
          text,
          confidence: 0.7,
        });
      });

      return entities;
    } catch (error) {
      this.logger.warn('NLP entity extraction failed, skipping:', error);
      return [];
    }
  }

  /**
   * Deduplicate entities by type and text (case-insensitive)
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Set<string>();
    const deduplicated: Entity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.text.toLowerCase()}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(entity);
      }
    }

    return deduplicated;
  }

  /**
   * Filter entities by minimum confidence
   */
  filterByConfidence(entities: Entity[], minConfidence: number): Entity[] {
    return entities.filter((entity) => entity.confidence >= minConfidence);
  }
}
