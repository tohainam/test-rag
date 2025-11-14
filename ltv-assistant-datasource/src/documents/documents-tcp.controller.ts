import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsTcpController {
  constructor(private readonly documentsService: DocumentsService) {}

  @MessagePattern({ cmd: 'get_document_by_id' })
  async getDocumentById(
    @Payload() data: { documentId: string; userId: string; userRole: string },
  ) {
    try {
      const document = await this.documentsService.findOne(
        data.documentId,
        data.userId,
        data.userRole,
      );
      return { success: true, document };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  @MessagePattern('get_whitelist_documents')
  async getWhitelistDocuments(@Payload() data: { userId: string }) {
    try {
      const documentIds = await this.documentsService.getWhitelistDocumentIds(
        data.userId,
      );
      return { success: true, documentIds };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  @MessagePattern('search_documents_by_metadata')
  async searchDocumentsByMetadata(
    @Payload()
    data: {
      query: string;
      whitelistDocIds: string[];
      topK: number;
    },
  ) {
    try {
      const documents = await this.documentsService.searchDocumentsByMetadata(
        data.query,
        data.whitelistDocIds,
        data.topK,
      );
      return { success: true, documents };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, documents: [] };
    }
  }

  @MessagePattern({ cmd: 'verify_document_access' })
  async verifyDocumentAccess(
    @Payload() data: { documentId: string; userId: string; userRole: string },
  ) {
    try {
      await this.documentsService.findOne(
        data.documentId,
        data.userId,
        data.userRole,
      );
      return { success: true, hasAccess: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, hasAccess: false, error: errorMessage };
    }
  }

  @MessagePattern('get_document_details')
  async getDocumentDetails(@Payload() data: { documentIds: string[] }) {
    try {
      const documents = await this.documentsService.getDocumentDetailsByIds(
        data.documentIds,
      );
      return { success: true, documents };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, documents: [] };
    }
  }
}
