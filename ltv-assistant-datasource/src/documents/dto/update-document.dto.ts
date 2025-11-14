import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentDto } from './create-document.dto';
import { IsEnum, IsOptional } from 'class-validator';

export enum DocumentStatus {
  DRAFT = 'draft',
  INDEXING = 'indexing',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;
}
