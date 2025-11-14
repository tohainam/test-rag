import { IsString, IsOptional, IsDateString } from 'class-validator';

export class AddUserToDocumentDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
