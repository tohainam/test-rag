import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { eq, desc } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { DATABASE_CONNECTION } from '../database/database.module';
import { files, documents, outboxEvents } from '../database/schema';
import { StorageService } from '../storage/storage.service';
import { PresignedUrlRequestDto } from './dto/presigned-url-request.dto';
import { InitMultipartDto } from './dto/init-multipart.dto';
import { CompleteMultipartDto } from './dto/complete-multipart.dto';
import { INDEXING_SERVICE_CLIENT } from '../common/modules/indexing-tcp-client.module';
import { OutboxService } from '../outbox/outbox.service';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '../database/schema';
import {
  isAllowedMimeType,
  getAllowedFileTypesDescription,
} from './constants/allowed-mime-types';
import { generateDateBasedFilePath } from './utils/file-path.utils';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxSingleUploadSizeMB: number;
  private readonly multipartChunkSizeMB: number;
  private readonly maxFileSizeMB: number;
  private readonly presignedUrlExpiryMinutes: number;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
    private configService: ConfigService,
    private storageService: StorageService,
    private outboxService: OutboxService,
    @Inject(INDEXING_SERVICE_CLIENT)
    private indexingServiceClient: ClientProxy,
  ) {
    this.maxSingleUploadSizeMB = this.configService.get<number>(
      'MAX_SINGLE_UPLOAD_SIZE_MB',
      20,
    );
    this.multipartChunkSizeMB = this.configService.get<number>(
      'MULTIPART_CHUNK_SIZE_MB',
      5,
    );
    this.maxFileSizeMB = this.configService.get<number>(
      'MAX_FILE_SIZE_MB',
      1000,
    );
    // Reduced from 15 to 5 minutes for better security
    // Shorter expiry window reduces risk if presigned URL is leaked
    this.presignedUrlExpiryMinutes = this.configService.get<number>(
      'PRESIGNED_URL_EXPIRY_MINUTES',
      5,
    );
  }

  async requestPresignedUrl(
    documentId: string,
    dto: PresignedUrlRequestDto,
    userId: string,
    userRole: string,
  ) {
    // Verify document exists and user has access
    await this.verifyDocumentAccess(documentId, userId, userRole);

    // Validate MIME type (server-side validation as defense-in-depth)
    if (!isAllowedMimeType(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported file type. Allowed types: ${getAllowedFileTypesDescription()}`,
      );
    }

    // Validate file size
    const fileSizeMB = dto.filesize / (1024 * 1024);
    if (fileSizeMB > this.maxSingleUploadSizeMB) {
      throw new BadRequestException(
        `File size exceeds maximum for single upload (${this.maxSingleUploadSizeMB}MB). Use multipart upload.`,
      );
    }

    if (fileSizeMB > this.maxFileSizeMB) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${this.maxFileSizeMB}MB)`,
      );
    }

    // Create file record with new path format
    const fileId = uuidv4();
    const filePath = generateDateBasedFilePath(dto.filename);
    const expiresAt = new Date(
      Date.now() + this.presignedUrlExpiryMinutes * 60 * 1000,
    );

    await this.db.insert(files).values({
      id: fileId,
      documentId: documentId,
      filename: dto.filename,
      filePath: filePath,
      fileType: this.getFileExtension(dto.filename),
      fileSize: dto.filesize,
      mimeType: dto.contentType,
      status: 'pending',
    });

    // Generate presigned URL
    const presignedUrl = await this.storageService.generatePresignedPutUrl(
      filePath,
      this.presignedUrlExpiryMinutes * 60,
    );

    return {
      fileId,
      presignedUrl,
      expiresAt,
      uploadType: 'single',
    };
  }

  async initMultipartUpload(
    documentId: string,
    dto: InitMultipartDto,
    userId: string,
    userRole: string,
  ) {
    // Verify document exists and user has access
    await this.verifyDocumentAccess(documentId, userId, userRole);

    // Validate MIME type (server-side validation as defense-in-depth)
    if (!isAllowedMimeType(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported file type. Allowed types: ${getAllowedFileTypesDescription()}`,
      );
    }

    // Validate file size
    const fileSizeMB = dto.filesize / (1024 * 1024);
    if (fileSizeMB <= this.maxSingleUploadSizeMB) {
      throw new BadRequestException(
        `File size is small enough for single upload. Use single upload instead.`,
      );
    }

    if (fileSizeMB > this.maxFileSizeMB) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${this.maxFileSizeMB}MB)`,
      );
    }

    // Create file record with new path format
    const fileId = uuidv4();
    const filePath = generateDateBasedFilePath(dto.filename);
    const expiresAt = new Date(
      Date.now() + this.presignedUrlExpiryMinutes * 60 * 1000,
    );

    // Initialize multipart upload in storage
    const uploadId = await this.storageService.initMultipartUpload(filePath);

    // Save file record with uploadId
    await this.db.insert(files).values({
      id: fileId,
      documentId: documentId,
      filename: dto.filename,
      filePath: filePath,
      fileType: this.getFileExtension(dto.filename),
      fileSize: dto.filesize,
      mimeType: dto.contentType,
      uploadId: uploadId,
      status: 'uploading',
    });

    // Generate presigned URLs for all parts
    const presignedUrls =
      await this.storageService.generatePresignedUrlsForParts(
        filePath,
        uploadId,
        dto.partsCount,
        this.presignedUrlExpiryMinutes * 60,
      );

    return {
      fileId,
      uploadId,
      presignedUrls: presignedUrls.map((p) => ({
        partNumber: p.partNumber,
        url: p.url,
        expiresAt,
      })),
      uploadType: 'multipart',
      partSize: this.multipartChunkSizeMB * 1024 * 1024,
    };
  }

  async confirmUpload(fileId: string, userId: string, userRole: string) {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Verify file exists in storage
    const fileExists = await this.storageService.fileExists(file.filePath);
    if (!fileExists) {
      throw new BadRequestException(
        'File not found in storage. Upload may have failed.',
      );
    }

    // Transaction: Update file status + Create outbox event
    await this.db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({
          status: 'uploaded',
          uploadedAt: new Date(),
        })
        .where(eq(files.id, fileId));

      await this.outboxService.createOutboxEvent({
        documentId: file.documentId,
        fileId: file.id,
        filePath: file.filePath,
        filename: file.filename,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        uploadUserId: userId,
      });
    });

    return {
      fileId,
      status: 'uploaded',
      message: 'File upload confirmed and queued for indexing',
    };
  }

  async completeMultipartUpload(
    fileId: string,
    dto: CompleteMultipartDto,
    userId: string,
    userRole: string,
  ) {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    if (!file.uploadId) {
      throw new BadRequestException('File is not a multipart upload');
    }

    // Complete multipart upload in storage
    await this.storageService.completeMultipartUpload(
      file.filePath,
      file.uploadId,
      dto.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    );

    // Transaction: Update file status + Create outbox event
    await this.db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({
          status: 'uploaded',
          uploadedAt: new Date(),
        })
        .where(eq(files.id, fileId));

      await this.outboxService.createOutboxEvent({
        documentId: file.documentId,
        fileId: file.id,
        filePath: file.filePath,
        filename: file.filename,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        uploadUserId: userId,
      });
    });

    return {
      fileId,
      status: 'uploaded',
      message: 'Multipart upload completed and queued for indexing',
    };
  }

  async getDownloadUrl(fileId: string, userId: string, userRole: string) {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Generate presigned URL for download
    const presignedUrl = await this.storageService.generatePresignedGetUrl(
      file.filePath,
      this.presignedUrlExpiryMinutes * 60,
    );

    return {
      fileId,
      filename: file.filename,
      presignedUrl,
      expiresAt: new Date(
        Date.now() + this.presignedUrlExpiryMinutes * 60 * 1000,
      ),
    };
  }

  async deleteFile(fileId: string, userId: string, userRole: string) {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, file.documentId));

    if (!document) {
      throw new NotFoundException('Associated document not found');
    }

    // Only owner or super_admin can delete
    if (userRole !== 'SUPER_ADMIN' && document.createdBy !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this file',
      );
    }

    // Check outbox status to determine if file can be deleted
    const [outboxEvent] = await this.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, fileId))
      .orderBy(desc(outboxEvents.createdAt))
      .limit(1);

    // Cannot delete if currently being processed (publishing status)
    if (outboxEvent && outboxEvent.status === 'publishing') {
      throw new ConflictException(
        'Cannot delete file while it is being processed. Please try again later.',
      );
    }

    // Check indexing status via TCP
    let indexingStatus: string | null = null;
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
          success: boolean;
          details: { status: string | null };
        }>('get_file_indexing_details', { fileId }),
      );

      indexingStatus = response.details?.status ?? null;

      // Cannot delete if currently being indexed
      if (indexingStatus === 'processing') {
        throw new ConflictException(
          'Cannot delete file while it is being indexed. Please try again later.',
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to check indexing status for file ${fileId}`,
        error,
      );
    }

    // If published/completed, cleanup indexed data via TCP
    if (
      (outboxEvent && outboxEvent.status === 'published') ||
      indexingStatus === 'completed'
    ) {
      try {
        await firstValueFrom(
          this.indexingServiceClient.send('delete_indexed_file', { fileId }),
        );
        this.logger.log(`Cleaned up indexed data for file ${fileId}`);
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup indexed data for ${fileId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    // Delete outbox event if exists
    if (outboxEvent) {
      await this.db
        .delete(outboxEvents)
        .where(eq(outboxEvents.id, outboxEvent.id));
    }

    // Delete from storage
    await this.storageService.deleteFile(file.filePath);

    // Delete from database
    await this.db.delete(files).where(eq(files.id, fileId));

    return {
      message: 'File deleted successfully',
    };
  }

  /**
   * Retry failed file indexing
   * Resets the outbox event to pending state for republishing
   */
  async retryFileIndexing(
    fileId: string,
    userId: string,
    userRole: string,
  ): Promise<{ message: string; fileId: string }> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Check indexing status via TCP first
    let indexingStatus: string | null = null;
    let indexingFailed = false;
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
          success: boolean;
          details: { status: string | null };
        }>('get_file_indexing_details', { fileId }),
      );

      indexingStatus = response.details?.status ?? null;

      // Cannot retry if currently being processed
      if (indexingStatus === 'processing' || indexingStatus === 'pending') {
        throw new ConflictException(
          `Cannot retry while file is being indexed (status: ${indexingStatus})`,
        );
      }

      // Check if indexing is in failed state
      indexingFailed = indexingStatus === 'failed';
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.warn(
        `Failed to check indexing status for file ${fileId}, proceeding with outbox check`,
        error,
      );
    }

    // Find the outbox event
    const [outboxEvent] = await this.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, fileId))
      .orderBy(desc(outboxEvents.createdAt))
      .limit(1);

    if (!outboxEvent) {
      throw new NotFoundException(
        `No outbox event found for file ${fileId}. File may not have been uploaded yet.`,
      );
    }

    // Check if outbox is in failed or poison state
    const outboxFailed =
      outboxEvent.status === 'failed' || outboxEvent.status === 'poison';

    // Allow retry if EITHER outbox OR indexing has failed
    if (!outboxFailed && !indexingFailed) {
      throw new BadRequestException(
        `Cannot retry: Outbox status is '${outboxEvent.status}' and indexing status is '${indexingStatus || 'unknown'}'. Retry only allowed when either has failed.`,
      );
    }

    // Cleanup any partial indexed data before retry
    if (indexingFailed) {
      try {
        await firstValueFrom(
          this.indexingServiceClient.send('verify_and_cleanup', { fileId }),
        );
        this.logger.log(`Cleaned up failed indexing data for file ${fileId}`);
      } catch (error) {
        this.logger.warn(
          `Cleanup verification failed for ${fileId}, proceeding with retry`,
          error,
        );
      }
    }

    // Create a NEW outbox event for retry (new ID = new BullMQ job ID)
    // This ensures the indexing worker treats it as a fresh job
    // We need to mark the old event as archived/superseded first
    await this.db
      .update(outboxEvents)
      .set({
        status: 'failed',
        errorLog: 'Superseded by retry',
      })
      .where(eq(outboxEvents.id, outboxEvent.id));

    // Parse the original payload to create a new event
    const originalPayload = JSON.parse(outboxEvent.payloadJson) as {
      documentId: string;
      fileId: string;
      filePath: string;
      filename: string;
      mimeType: string;
      fileSize: number;
      uploadUserId: string;
    };

    // Create new outbox event with fresh ID
    const newEventId = await this.outboxService.createOutboxEvent({
      documentId: originalPayload.documentId,
      fileId: originalPayload.fileId,
      filePath: originalPayload.filePath,
      filename: originalPayload.filename,
      mimeType: originalPayload.mimeType,
      fileSize: originalPayload.fileSize,
      uploadUserId: originalPayload.uploadUserId,
    });

    this.logger.log(
      `Retry scheduled for file ${fileId} (new outbox: ${newEventId}, old: ${outboxEvent.id}, reason: ${outboxFailed ? 'outbox failed' : 'indexing failed'})`,
    );

    return {
      message: 'File indexing retry scheduled successfully',
      fileId,
    };
  }

  private async verifyDocumentAccess(
    documentId: string,
    userId: string,
    userRole: string,
  ) {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Check access based on role
    if (userRole === 'SUPER_ADMIN') {
      return; // Super admin has access to all
    }

    if (userRole === 'ADMIN') {
      // Admin can access their own documents and public documents
      if (document.createdBy !== userId && document.type !== 'public') {
        throw new ForbiddenException('You do not have access to this document');
      }
      return;
    }

    // Regular users can only access public documents
    if (document.type !== 'public') {
      throw new ForbiddenException('You do not have access to this document');
    }
  }

  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'unknown';
  }

  async getFilesWithIndexingStatus(
    documentId: string,
    userId: string,
    userRole: string,
  ): Promise<unknown[]> {
    // Verify document access
    await this.verifyDocumentAccess(documentId, userId, userRole);

    // Get files for the document
    const documentFiles = await this.db
      .select()
      .from(files)
      .where(eq(files.documentId, documentId));

    if (documentFiles.length === 0) {
      return [];
    }

    const fileIds = documentFiles.map((f) => f.id);

    // Build a more comprehensive query for all fileIds
    const outboxStatusMap = new Map<string, string>();
    for (const fileId of fileIds) {
      const [outboxEvent] = await this.db
        .select({
          status: outboxEvents.status,
        })
        .from(outboxEvents)
        .where(eq(outboxEvents.aggregateId, fileId))
        .orderBy(desc(outboxEvents.createdAt))
        .limit(1);

      if (outboxEvent) {
        outboxStatusMap.set(fileId, outboxEvent.status);
      }
    }

    // Get indexing statuses from indexing service via TCP
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
          success: boolean;
          statuses: Array<{
            fileId: string;
            status: string;
            error: string | null;
            completedAt: Date | null;
          }>;
        }>('get_indexing_status', { fileIds }),
      );

      if (!response.success) {
        this.logger.warn(
          `Failed to get indexing statuses for document ${documentId}`,
        );
        // Return files with outbox status only
        return documentFiles.map((file) => ({
          ...file,
          outboxStatus: outboxStatusMap.get(file.id) || null,
          indexingStatus: null,
        }));
      }

      // Merge files with both outbox and indexing statuses
      const indexingStatusMap = new Map(
        response.statuses.map((s) => [s.fileId, s]),
      );

      return documentFiles.map((file) => {
        const indexingInfo = indexingStatusMap.get(file.id);
        return {
          ...file,
          outboxStatus: outboxStatusMap.get(file.id) || null,
          indexingStatus: indexingInfo?.status || null,
          indexingError: indexingInfo?.error || null,
          indexedAt: indexingInfo?.completedAt || null,
        };
      });
    } catch (error) {
      this.logger.error(
        `Error fetching indexing statuses for document ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Return files with outbox status only if indexing service is unavailable
      return documentFiles.map((file) => ({
        ...file,
        outboxStatus: outboxStatusMap.get(file.id) || null,
        indexingStatus: null,
      }));
    }
  }

  async getFileDetails(
    fileId: string,
    userId: string,
    userRole: string,
  ): Promise<unknown> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Get indexing details from indexing service via TCP
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
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
        }>('get_file_indexing_details', { fileId }),
      );

      if (!response.success || !response.details) {
        this.logger.warn(`Failed to get indexing details for file ${fileId}`);
        return {
          ...file,
          indexingStatus: null,
          indexingError: null,
          indexedAt: null,
          parentChunksCount: 0,
          childChunksCount: 0,
        };
      }

      return {
        ...file,
        indexingStatus: response.details.status,
        indexingError: response.details.error,
        startedAt: response.details.startedAt,
        indexedAt: response.details.completedAt,
        attempts: response.details.attempts,
        parentChunksCount: response.details.parentChunksCount,
        childChunksCount: response.details.childChunksCount,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching indexing details for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        ...file,
        indexingStatus: null,
        indexingError: null,
        indexedAt: null,
        parentChunksCount: 0,
        childChunksCount: 0,
      };
    }
  }

  async getParentChunks(
    fileId: string,
    page: number,
    limit: number,
    userId: string,
    userRole: string,
  ): Promise<unknown> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Get parent chunks from indexing service via TCP
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
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
        }>('get_parent_chunks', { fileId, page, limit }),
      );

      if (!response.success) {
        this.logger.warn(`Failed to get parent chunks for file ${fileId}`);
        return {
          chunks: [],
          total: 0,
          page,
          limit,
        };
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Error fetching parent chunks for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException('Failed to retrieve parent chunks');
    }
  }

  async getChildChunks(
    fileId: string,
    page: number,
    limit: number,
    userId: string,
    userRole: string,
  ): Promise<unknown> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(eq(files.id, fileId));

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    // Verify document access
    await this.verifyDocumentAccess(file.documentId, userId, userRole);

    // Get child chunks from indexing service via TCP
    try {
      const response = await firstValueFrom(
        this.indexingServiceClient.send<{
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
        }>('get_child_chunks', { fileId, page, limit }),
      );

      if (!response.success) {
        this.logger.warn(`Failed to get child chunks for file ${fileId}`);
        return {
          chunks: [],
          total: 0,
          page,
          limit,
        };
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Error fetching child chunks for file ${fileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException('Failed to retrieve child chunks');
    }
  }
}
