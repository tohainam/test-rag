export class RefreshTokenListItemDto {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}
