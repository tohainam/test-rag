import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ALLOWED_MIME_TYPES } from '../constants/allowed-mime-types';

export class InitMultipartDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsNumber()
  @Min(1)
  @Max(1024 * 1024 * 1024) // 1GB max
  filesize: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: `Content type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
  })
  contentType: string;

  @IsNumber()
  @Min(1)
  @Max(200) // Max 200 parts
  partsCount: number;
}
