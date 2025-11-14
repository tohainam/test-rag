/**
 * Datasource TCP Client
 * Communicates with ltv-assistant-datasource service via TCP
 * Reference: PRD Lines 1660-1673
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class DatasourceClient {
  private readonly logger = new Logger(DatasourceClient.name);

  constructor(
    @Inject('DATASOURCE_SERVICE') private readonly client: ClientProxy,
  ) {}

  /**
   * Get whitelist documents for a user
   * TCP call to datasource service with 2s timeout
   * @param userId - User ID to get whitelist for
   * @returns Array of document IDs that user has access to
   */
  async getWhitelistDocuments(userId: string): Promise<string[]> {
    try {
      this.logger.log(`Fetching whitelist documents for user: ${userId}`);

      const response = await this.client
        .send<{ documentIds: string[] }>('get_whitelist_documents', { userId })
        .pipe(
          timeout(2000), // 2s timeout
          catchError((error) => {
            this.logger.warn(
              `Whitelist fetch failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            );
            return of({ documentIds: [] }); // Graceful fallback
          }),
        )
        .toPromise();

      const documentIds = response?.documentIds || [];

      this.logger.log(
        `Fetched ${documentIds.length} whitelist documents for user: ${userId}`,
      );

      return documentIds;
    } catch (error) {
      this.logger.error(
        `Whitelist fetch error for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Graceful fallback
    }
  }

  /**
   * Search documents by metadata (title, description, file type)
   * TCP call to datasource service with 3s timeout
   * @param query - Search query text
   * @param whitelistDocIds - Document IDs user has access to
   * @param topK - Maximum number of documents to return
   * @returns Array of matching documents with metadata
   */
  async searchDocumentsByMetadata(
    query: string,
    whitelistDocIds: string[],
    topK: number,
  ): Promise<
    Array<{
      documentId: string;
      title: string;
      description?: string;
      type: string;
      fileType?: string;
      fileIds: string[];
    }>
  > {
    try {
      this.logger.log(
        `Searching documents by metadata: query="${query}", whitelist=${whitelistDocIds.length} docs, topK=${topK}`,
      );

      const response = await this.client
        .send<{
          documents: Array<{
            documentId: string;
            title: string;
            description?: string;
            type: string;
            fileType?: string;
            fileIds: string[];
          }>;
        }>('search_documents_by_metadata', {
          query,
          whitelistDocIds,
          topK,
        })
        .pipe(
          timeout(3000), // 3s timeout
          catchError((error) => {
            this.logger.warn(
              `Document metadata search failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return of({ documents: [] }); // Graceful fallback
          }),
        )
        .toPromise();

      const documents = response?.documents || [];

      this.logger.log(
        `Found ${documents.length} documents matching metadata search`,
      );

      return documents;
    } catch (error) {
      this.logger.error(
        `Document metadata search error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return []; // Graceful fallback
    }
  }

  /**
   * Get document details by IDs
   * Used for cache safety check - verify all documents are public before caching
   * @param documentIds - Array of document IDs to fetch
   * @returns Array of document details with access type
   */
  async getDocumentDetails(documentIds: string[]): Promise<
    Array<{
      documentId: string;
      title: string;
      type: string;
      accessType: 'public' | 'private';
    }>
  > {
    try {
      this.logger.log(`Fetching details for ${documentIds.length} documents`);

      const response = await this.client
        .send<{
          documents: Array<{
            documentId: string;
            title: string;
            type: string;
            accessType: 'public' | 'private';
          }>;
        }>('get_document_details', { documentIds })
        .pipe(
          timeout(2000), // 2s timeout
          catchError((error) => {
            this.logger.warn(
              `Document details fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return of({ documents: [] });
          }),
        )
        .toPromise();

      const documents = response?.documents || [];

      this.logger.log(`Fetched details for ${documents.length} documents`);

      return documents;
    } catch (error) {
      this.logger.error(
        `Document details fetch error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Health check for datasource service connection
   * @returns true if service is accessible, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client
        .send<{ status: string }>('health_check', {})
        .pipe(
          timeout(1000),
          catchError(() => of({ status: 'error' })),
        )
        .toPromise();

      return response?.status === 'ok';
    } catch {
      this.logger.warn('Datasource service health check failed');
      return false;
    }
  }
}
