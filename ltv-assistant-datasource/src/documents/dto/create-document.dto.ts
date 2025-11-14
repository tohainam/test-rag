import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';

export enum DocumentType {
  PUBLIC = 'public',
  RESTRICTED = 'restricted',
}

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DocumentType)
  @IsOptional()
  type?: DocumentType;
}
