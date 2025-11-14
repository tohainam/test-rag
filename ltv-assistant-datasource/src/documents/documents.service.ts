import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { eq, and, like, or, desc, sql, SQLWrapper } from 'drizzle-orm';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { DATABASE_CONNECTION } from '../database/database.module';
import {
  documents,
  files,
  documentWhitelist,
  Document,
  File,
} from '../database/schema';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UserRole } from '../common/constants/roles.constant';
import { AUTH_SERVICE_CLIENT } from '../common/modules/auth-tcp-client.module';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '../database/schema';

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: 'public' | 'restricted';
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

interface UserResponse {
  success: boolean;
  users: Array<{ id: string; name: string; email: string }>;
  error?: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
    private configService: ConfigService,
    @Inject(AUTH_SERVICE_CLIENT) private authServiceClient: ClientProxy,
  ) {}

  async create(createDocumentDto: CreateDocumentDto, userId: string) {
    const documentId = uuidv4();

    await this.db.insert(documents).values({
      id: documentId,
      title: createDocumentDto.title,
      description: createDocumentDto.description || null,
      type: createDocumentDto.type || 'public',
      createdBy: userId,
    });

    // Fetch the created document (MySQL doesn't support RETURNING)
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    return document;
  }

  async findAll(query: PaginationQuery, userId: string, userRole: string) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    // Build where conditions
    const whereConditions: SQLWrapper[] = [];

    // Access control based on role
    if (userRole === (UserRole.SUPER_ADMIN as string)) {
      // Super admin sees all documents
    } else if (userRole === (UserRole.ADMIN as string)) {
      // Admin sees own documents + public documents
      const condition = or(
        eq(documents.type, 'public'),
        eq(documents.createdBy, userId),
      );
      if (condition) {
        whereConditions.push(condition);
      }
    } else {
      // Regular users see only public documents (whitelist check done in retrieval service)
      whereConditions.push(eq(documents.type, 'public'));
    }

    // Additional filters
    if (query.search) {
      const searchCondition = or(
        like(documents.title, `%${query.search}%`),
        like(documents.description, `%${query.search}%`),
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    if (query.type) {
      whereConditions.push(eq(documents.type, query.type));
    }

    // Build final where clause
    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get documents with file count
    const docs = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        description: documents.description,
        type: documents.type,
        createdBy: documents.createdBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        fileCount: sql<number>`(SELECT COUNT(*) FROM ${files} WHERE ${files.documentId} = ${documents.id})`,
      })
      .from(documents)
      .where(whereClause)
      .orderBy(
        sortOrder === 'desc' ? desc(documents[sortBy]) : documents[sortBy],
      )
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(whereClause);

    return {
      data: docs,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    };
  }

  async findOne(id: string, userId: string, userRole: string) {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Check access
    if (userRole !== (UserRole.SUPER_ADMIN as string)) {
      if (document.type === 'restricted' && document.createdBy !== userId) {
        // Check if user is in whitelist
        const [whitelistEntry] = await this.db
          .select()
          .from(documentWhitelist)
          .where(
            and(
              eq(documentWhitelist.documentId, id),
              eq(documentWhitelist.userId, userId),
            ),
          )
          .limit(1);

        if (!whitelistEntry) {
          throw new ForbiddenException(
            'You do not have access to this document',
          );
        }

        // Check if access has expired
        if (
          whitelistEntry.expiresAt &&
          new Date(whitelistEntry.expiresAt) < new Date()
        ) {
          throw new ForbiddenException(
            'Your access to this document has expired',
          );
        }
      }
    }

    // Get associated files
    const documentFiles = await this.db
      .select()
      .from(files)
      .where(eq(files.documentId, id));

    return {
      ...document,
      files: documentFiles,
    };
  }

  async update(
    id: string,
    updateDocumentDto: UpdateDocumentDto,
    userId: string,
    userRole: string,
  ) {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Only owner or super_admin can update
    if (
      userRole !== (UserRole.SUPER_ADMIN as string) &&
      document.createdBy !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this document',
      );
    }

    await this.db
      .update(documents)
      .set({
        ...updateDocumentDto,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id));

    // Fetch the updated document (MySQL doesn't support RETURNING)
    const [updated] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    return updated;
  }

  async remove(id: string, userId: string, userRole: string) {
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Only owner or super_admin can delete
    if (
      userRole !== (UserRole.SUPER_ADMIN as string) &&
      document.createdBy !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to delete this document',
      );
    }

    // Delete document (files will be cascade deleted by foreign key if configured)
    await this.db.delete(documents).where(eq(documents.id, id));

    return { message: 'Document deleted successfully' };
  }

  async getDocumentUsers(id: string, userId: string, userRole: string) {
    // Verify document exists and user has permission
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Only owner or super_admin can manage users
    if (
      userRole !== (UserRole.SUPER_ADMIN as string) &&
      document.createdBy !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to manage users for this document',
      );
    }

    // Get whitelist entries
    const whitelistEntries = await this.db
      .select()
      .from(documentWhitelist)
      .where(eq(documentWhitelist.documentId, id));

    // Fetch user details from Auth Service via TCP
    const userIds = whitelistEntries.map((entry) => entry.userId);
    if (userIds.length === 0) {
      return [];
    }

    const usersResponse = await firstValueFrom(
      this.authServiceClient.send<UserResponse>(
        { cmd: 'get_users_by_ids' },
        { userIds },
      ),
    );

    // Check if TCP call was successful
    if (!usersResponse || !usersResponse.success) {
      throw new Error(
        usersResponse?.error ||
          'Failed to fetch user details from auth service',
      );
    }

    // Merge whitelist data with user details
    return whitelistEntries.map((entry) => {
      const user = usersResponse.users.find((u) => u.id === entry.userId);
      return {
        id: entry.id,
        userId: entry.userId,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || 'Unknown',
        grantedBy: entry.grantedBy,
        grantedAt: entry.grantedAt,
        expiresAt: entry.expiresAt,
      };
    });
  }

  async addUserToDocument(
    id: string,
    targetUserId: string,
    currentUserId: string,
    userRole: string,
    expiresAt?: string,
  ) {
    // Verify document exists and user has permission
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Only owner or super_admin can manage users
    if (
      userRole !== (UserRole.SUPER_ADMIN as string) &&
      document.createdBy !== currentUserId
    ) {
      throw new ForbiddenException(
        'You do not have permission to manage users for this document',
      );
    }

    // Check if document is restricted
    if (document.type !== 'restricted') {
      throw new ForbiddenException(
        'User access can only be managed for restricted documents',
      );
    }

    // Check if user already has access
    const [existing] = await this.db
      .select()
      .from(documentWhitelist)
      .where(
        and(
          eq(documentWhitelist.documentId, id),
          eq(documentWhitelist.userId, targetUserId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ForbiddenException('User already has access to this document');
    }

    const whitelistId = uuidv4();

    await this.db.insert(documentWhitelist).values({
      id: whitelistId,
      documentId: id,
      userId: targetUserId,
      grantedBy: currentUserId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Fetch the created entry
    const [created] = await this.db
      .select()
      .from(documentWhitelist)
      .where(eq(documentWhitelist.id, whitelistId))
      .limit(1);

    // Fetch user details
    const usersResponse = await firstValueFrom(
      this.authServiceClient.send<UserResponse>(
        { cmd: 'get_users_by_ids' },
        { userIds: [targetUserId] },
      ),
    );

    // Check if TCP call was successful
    if (!usersResponse || !usersResponse.success) {
      throw new Error(
        usersResponse?.error ||
          'Failed to fetch user details from auth service',
      );
    }

    const user = usersResponse.users[0];

    return {
      id: created.id,
      userId: created.userId,
      userName: user?.name || 'Unknown',
      userEmail: user?.email || 'Unknown',
      grantedBy: created.grantedBy,
      grantedAt: created.grantedAt,
      expiresAt: created.expiresAt,
    };
  }

  async removeUserFromDocument(
    id: string,
    targetUserId: string,
    currentUserId: string,
    userRole: string,
  ) {
    // Verify document exists and user has permission
    const [document] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    // Only owner or super_admin can manage users
    if (
      userRole !== (UserRole.SUPER_ADMIN as string) &&
      document.createdBy !== currentUserId
    ) {
      throw new ForbiddenException(
        'You do not have permission to manage users for this document',
      );
    }

    // Delete whitelist entry
    await this.db
      .delete(documentWhitelist)
      .where(
        and(
          eq(documentWhitelist.documentId, id),
          eq(documentWhitelist.userId, targetUserId),
        ),
      );

    return { message: 'User removed from document successfully' };
  }

  /**
   * Get whitelist document IDs for a specific user
   * Used by retrieval service for access control filtering
   * @param userId - User ID to get whitelist for
   * @returns Array of document IDs the user has access to
   */
  async getWhitelistDocumentIds(userId: string): Promise<string[]> {
    // Query document_whitelist table for documents the user has access to
    const whitelistEntries = await this.db
      .select({ documentId: documentWhitelist.documentId })
      .from(documentWhitelist)
      .where(eq(documentWhitelist.userId, userId));

    // Return all document IDs (expiration check can be added later if needed)
    return whitelistEntries.map((entry) => entry.documentId);
  }

  /**
   * Search documents by metadata (title, description, type, fileType)
   * Used by retrieval service for metadata-based search
   * @param query - Search query string
   * @param whitelistDocIds - Document IDs user has access to (for filtering)
   * @param topK - Maximum number of results to return
   * @returns Array of matching documents with file information
   */
  async searchDocumentsByMetadata(
    query: string,
    whitelistDocIds: string[],
    topK: number,
  ): Promise<
    Array<{
      documentId: string;
      title: string;
      description: string | null;
      type: 'public' | 'restricted';
      fileType: string | null;
      fileIds: string[];
    }>
  > {
    this.logger.log(
      `Searching documents by metadata: query="${query}", whitelistDocIds=${whitelistDocIds.length}, topK=${topK}`,
    );

    // Build search conditions
    const searchConditions: SQLWrapper[] = [];

    // Text search on title and description - CASE INSENSITIVE with OR for multiple terms
    if (query && query.trim()) {
      // Split query into terms for better matching
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      if (terms.length > 0) {
        // Match ANY term in title OR description (case-insensitive)
        const termConditions = terms.map((term) =>
          or(
            sql`LOWER(${documents.title}) LIKE ${`%${term}%`}`,
            sql`LOWER(${documents.description}) LIKE ${`%${term}%`}`,
          ),
        );
        const searchCondition = or(...termConditions);
        if (searchCondition) {
          searchConditions.push(searchCondition);
        }
      }
    }

    // Access filter: public documents OR documents in whitelist
    const accessCondition = or(
      eq(documents.type, 'public'),
      whitelistDocIds.length > 0
        ? sql`${documents.id} IN (${sql.join(
            whitelistDocIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`false`,
    );

    if (accessCondition) {
      searchConditions.push(accessCondition);
    }

    // Build final where clause
    const whereClause =
      searchConditions.length > 0 ? and(...searchConditions) : undefined;

    this.logger.log(
      `Search conditions: ${searchConditions.length} conditions applied`,
    );

    // Query documents with their files
    const results = await this.db
      .select({
        documentId: documents.id,
        title: documents.title,
        description: documents.description,
        type: documents.type,
        fileId: files.id,
        fileType: files.fileType,
      })
      .from(documents)
      .leftJoin(files, eq(files.documentId, documents.id))
      .where(whereClause)
      .limit(topK * 10); // Over-fetch to account for grouping

    this.logger.log(
      `Raw query results: ${results.length} rows from ${new Set(results.map((r) => r.documentId)).size} documents`,
    );

    // Group by documentId and aggregate file info
    const groupedMap = new Map<
      string,
      {
        documentId: string;
        title: string;
        description: string | null;
        type: 'public' | 'restricted';
        fileType: string | null;
        fileIds: string[];
      }
    >();

    results.forEach((row) => {
      const existing = groupedMap.get(row.documentId);
      if (existing) {
        // Add file to existing document entry
        if (row.fileId) {
          existing.fileIds.push(row.fileId);
          // Track most common file type
          if (row.fileType && !existing.fileType) {
            existing.fileType = row.fileType;
          }
        }
      } else {
        // Create new document entry
        groupedMap.set(row.documentId, {
          documentId: row.documentId,
          title: row.title,
          description: row.description,
          type: row.type,
          fileType: row.fileType,
          fileIds: row.fileId ? [row.fileId] : [],
        });
      }
    });

    // Convert map to array and limit to topK
    return Array.from(groupedMap.values()).slice(0, topK);
  }

  /**
   * Get document details by IDs
   * Used by retrieval service for cache safety checks
   * Returns document ID, title, type, and access type for each document
   *
   * @param documentIds - Array of document IDs to fetch
   * @returns Array of document details with access type
   */
  async getDocumentDetailsByIds(documentIds: string[]): Promise<
    Array<{
      documentId: string;
      title: string;
      type: string;
      accessType: 'public' | 'private';
    }>
  > {
    if (documentIds.length === 0) {
      return [];
    }

    // Fetch documents from database
    const results = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        type: documents.type,
      })
      .from(documents)
      .where(
        sql`${documents.id} IN (${sql.join(
          documentIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    // Map to expected format
    // type 'public' -> accessType 'public'
    // type 'restricted' -> accessType 'private'
    return results.map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      type: doc.type,
      accessType: doc.type === 'public' ? 'public' : 'private',
    }));
  }
}
