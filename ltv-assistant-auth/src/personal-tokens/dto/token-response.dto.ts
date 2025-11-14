export class TokenResponseDto {
  token!: string;
  id!: number;
  name!: string;
  prefix!: string;
  expiresAt!: Date | null;
  createdAt!: Date;
}

export class TokenListItemDto {
  id!: number;
  name!: string;
  prefix!: string;
  lastUsedAt!: Date | null;
  expiresAt!: Date | null;
  isExpired!: boolean;
  createdAt!: Date;
}
