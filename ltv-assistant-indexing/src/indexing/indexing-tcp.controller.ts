import { Controller, Logger } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { IndexingService } from './indexing.service';

@Controller()
export class IndexingTcpController {
  private readonly logger = new Logger(IndexingTcpController.name);

  constructor(private readonly indexingService: IndexingService) {}

  @MessagePattern('get_indexing_status')
  async getIndexingStatus(data: { fileIds: string[] }): Promise<{
    success: boolean;
    statuses: Array<{
      fileId: string;
      status: string;
      error: string | null;
      completedAt: Date | null;
    }>;
  }> {
    try {
      this.logger.log(
        `Received request to get indexing status for ${data.fileIds.length} files`,
      );

      const statuses = await this.indexingService.getStatusByFileIds(
        data.fileIds,
      );

      return {
        success: true,
        statuses,
      };
    } catch (error) {
      this.logger.error(
        'Error getting indexing status',
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        statuses: [],
      };
    }
  }

  @MessagePattern('get_parent_chunks')
  async getParentChunks(data: {
    fileId: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    chunks: Array<{
      id: string;
      fileId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log(
        `Received request to get parent chunks for file ${data.fileId}`,
      );

      const result = await this.indexingService.getParentChunksByFileId(
        data.fileId,
        data.page ?? 1,
        data.limit ?? 20,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(
        'Error getting parent chunks',
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        chunks: [],
        total: 0,
        page: data.page ?? 1,
        limit: data.limit ?? 20,
      };
    }
  }

  @MessagePattern('get_child_chunks')
  async getChildChunks(data: {
    fileId: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    chunks: Array<{
      id: string;
      fileId: string;
      parentChunkId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log(
        `Received request to get child chunks for file ${data.fileId}`,
      );

      const result = await this.indexingService.getChildChunksByFileId(
        data.fileId,
        data.page ?? 1,
        data.limit ?? 50,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(
        'Error getting child chunks',
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        chunks: [],
        total: 0,
        page: data.page ?? 1,
        limit: data.limit ?? 50,
      };
    }
  }

  @MessagePattern('get_child_chunks_by_parent')
  async getChildChunksByParent(data: {
    parentChunkId: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    chunks: Array<{
      id: string;
      fileId: string;
      parentChunkId: string;
      content: string;
      tokens: number;
      chunkIndex: number;
      metadata: unknown;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      this.logger.log(
        `Received request to get child chunks for parent ${data.parentChunkId}`,
      );

      const result = await this.indexingService.getChildChunksByParentId(
        data.parentChunkId,
        data.page ?? 1,
        data.limit ?? 50,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(
        'Error getting child chunks by parent',
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        chunks: [],
        total: 0,
        page: data.page ?? 1,
        limit: data.limit ?? 50,
      };
    }
  }

  @MessagePattern('get_file_indexing_details')
  async getFileIndexingDetails(data: { fileId: string }): Promise<{
    success: boolean;
    details: {
      fileId: string;
      status: string | null;
      error: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      attempts: number;
      parentChunksCount: number;
      childChunksCount: number;
    } | null;
  }> {
    try {
      this.logger.log(
        `Received request to get indexing details for file ${data.fileId}`,
      );

      const details = await this.indexingService.getFileIndexingDetails(
        data.fileId,
      );

      return {
        success: true,
        details,
      };
    } catch (error) {
      this.logger.error(
        'Error getting file indexing details',
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        details: null,
      };
    }
  }

  @MessagePattern('delete_indexed_file')
  async deleteIndexedFile(data: {
    fileId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(
        `Received request to delete indexed data for file ${data.fileId}`,
      );

      await this.indexingService.deleteIndexedFile(data.fileId);

      return {
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Error deleting indexed data for file ${data.fileId}`,
        error instanceof Error ? error.stack : String(error),
      );

      return {
        success: false,
        error: message,
      };
    }
  }
}
