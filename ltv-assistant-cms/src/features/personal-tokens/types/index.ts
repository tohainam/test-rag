export interface PersonalToken {
  id: number;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
  createdAt: Date;
}

export interface TokenCreatedResponse {
  token: string;
  id: number;
  name: string;
  prefix: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateTokenDto {
  name: string;
  expiresInDays: number | null;
}
