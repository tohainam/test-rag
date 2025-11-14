/**
 * Query Request DTO
 * Input for retrieval workflow
 */

import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class QueryRequestDto {
  @IsString()
  declare query: string;

  @IsOptional()
  @IsEnum(['retrieval_only', 'generation'])
  declare mode?: 'retrieval_only' | 'generation';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  declare topK?: number;

  @IsOptional()
  @IsBoolean()
  declare useCache?: boolean; // Phase 1.5: Enable/disable semantic cache (default: true)
}
