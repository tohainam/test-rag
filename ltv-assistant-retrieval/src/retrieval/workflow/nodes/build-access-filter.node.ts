/**
 * Build Access Filter Node
 * Reference: PRD Section "Build Access Control Filter" (Lines 1554-1683)
 * Implements RBAC-based access control filtering for Qdrant queries
 *
 * RBAC Logic:
 * - SUPER_ADMIN: No filter (full access)
 * - ADMIN: document_type=public OR created_by=userId OR document_id IN whitelist
 * - USER: document_type=public OR document_id IN whitelist
 */

import { Logger } from '@nestjs/common';
import type { RetrievalState } from '../state/retrieval-state';
import { DatasourceClient } from '../../clients/datasource.client';
import type { AccessFilter, QdrantFilter } from '../../types';

const logger = new Logger('BuildAccessFilterNode');

/**
 * Factory function to create buildAccessFilter node
 * Pattern: Inject DatasourceClient, return node function
 */
export function createBuildAccessFilterNode(
  datasourceClient: DatasourceClient,
) {
  /**
   * Node function: Build access control filter based on user role
   * @param state - Current retrieval state
   * @returns Partial state update with access filter and whitelist
   */
  return async (
    state: typeof RetrievalState.State,
  ): Promise<Partial<typeof RetrievalState.State>> => {
    const startTime = Date.now();

    logger.log(
      `[BuildAccessFilter] stage=5_build_access_filter substage=start status=starting role=${state.userRole}`,
    );

    try {
      let qdrantFilter: QdrantFilter;
      let whitelistDocIds: string[] = [];

      // ============================================
      // RBAC Logic: Build filter based on user role
      // Reference: PRD Lines 1595-1627
      // ============================================

      if (state.userRole === 'SUPER_ADMIN') {
        // SUPER_ADMIN: No filter - full access to all documents
        qdrantFilter = {};
        logger.log(
          `[BuildAccessFilter] stage=5_build_access_filter substage=rbac status=super_admin_no_filter`,
        );
      } else {
        // Get whitelist documents via TCP call to datasource service
        whitelistDocIds = await datasourceClient.getWhitelistDocuments(
          state.userId,
        );

        // Build "should" conditions (OR logic)
        const shouldConditions: Array<{
          key: string;
          match: { value: string | string[] };
        }> = [
          // Condition 1: Public documents (available to all users)
          {
            key: 'metadata.documentType',
            match: { value: 'public' },
          },
        ];

        // Condition 2: Documents in whitelist (user has explicit access)
        if (whitelistDocIds.length > 0) {
          shouldConditions.push({
            key: 'metadata.documentId',
            match: { value: whitelistDocIds }, // Array match
          });
        }

        // Note: created_by field doesn't exist in the collection metadata
        // Removed creator-based filtering for ADMIN users

        qdrantFilter = { should: shouldConditions };

        logger.log(
          `[BuildAccessFilter] stage=5_build_access_filter substage=rbac status=filter_built role=${state.userRole} conditions=${shouldConditions.length} whitelist_docs=${whitelistDocIds.length}`,
        );
      }

      // ============================================
      // Build AccessFilter object
      // Reference: PRD Lines 1636-1643
      // ============================================
      const accessFilter: AccessFilter = {
        role: state.userRole,
        publicAccess: true,
        whitelistDocIds,
        createdByUserId: state.userRole === 'ADMIN' ? state.userId : undefined,
        qdrantFilter,
      };

      const accessFilterDuration = Date.now() - startTime;

      logger.log(
        `[BuildAccessFilter] stage=5_build_access_filter substage=complete status=success duration=${accessFilterDuration}ms role=${state.userRole} whitelist_count=${whitelistDocIds.length}`,
      );

      // ============================================
      // Return state update
      // ============================================
      return {
        accessFilter,
        whitelistDocIds,
        currentStage: 'build_access_filter',
        metrics: {
          ...state.metrics,
          accessFilterDuration,
          whitelistDocCount: whitelistDocIds.length,
        },
      };
    } catch (error) {
      // ============================================
      // Error handling: Log and continue with restrictive filter
      // Reference: PRD Lines 1651-1657
      // ============================================
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDuration = Date.now() - startTime;
      logger.error(
        `[BuildAccessFilter] stage=5_build_access_filter substage=error status=failed duration=${errorDuration}ms error=${errorMessage}`,
      );

      // Fallback: Restrictive filter (public documents only)
      const fallbackFilter: AccessFilter = {
        role: state.userRole,
        publicAccess: true,
        whitelistDocIds: [],
        qdrantFilter: {
          should: [
            {
              key: 'metadata.documentType',
              match: { value: 'public' },
            },
          ],
        },
      };

      return {
        accessFilter: fallbackFilter,
        whitelistDocIds: [],
        currentStage: 'build_access_filter_failed',
        errors: [...state.errors, `Access filter error: ${errorMessage}`],
        metrics: {
          ...state.metrics,
          accessFilterDuration: Date.now() - startTime,
          whitelistDocCount: 0,
        },
      };
    }
  };
}
