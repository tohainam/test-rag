import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, gt } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import { RefreshToken, User } from '../database/schema';

@Injectable()
export class RefreshTokensService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
  ) {}

  /**
   * List all active refresh tokens for a user
   */
  async listUserRefreshTokens(userId: number): Promise<RefreshToken[]> {
    const tokens = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(schema.refreshTokens.createdAt);

    return tokens;
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(
    tokenId: number,
    requestingUserId: number,
    requestingUserRole: User['role'],
  ): Promise<void> {
    // Get the token
    const [token] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, tokenId))
      .limit(1);

    if (!token) {
      throw new NotFoundException('Refresh token not found');
    }

    // Check authorization
    const isSuperAdmin = requestingUserRole === 'SUPER_ADMIN';
    const isOwner = token.userId === requestingUserId;

    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException('Cannot revoke this refresh token');
    }

    // If super admin is revoking someone else's token, check target user role
    if (isSuperAdmin && !isOwner) {
      const [targetUser] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, token.userId))
        .limit(1);

      if (targetUser && targetUser.role === 'SUPER_ADMIN') {
        throw new ForbiddenException(
          'Cannot revoke refresh tokens for super admin users',
        );
      }
    }

    // Delete the token
    await this.db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, tokenId));
  }
}
