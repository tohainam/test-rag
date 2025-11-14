import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, isNull, or, gt, SQL, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import { PersonalAccessToken, User } from '../database/schema';
import * as crypto from 'crypto';
import { crc32 } from 'crc';

const MAX_TOKENS_PER_USER = 10;
const TOKEN_PREFIX = 'ltv_';

@Injectable()
export class PersonalTokensService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
  ) {}

  /**
   * Generate a personal access token
   * Format: ltv_<checksum(6)>_<random(32)> = 41 chars total
   */
  async generateToken(
    userId: number,
    name: string,
    expiresInDays: number | null,
  ): Promise<{ token: string; tokenData: PersonalAccessToken }> {
    // Check active token count (max 10)
    const activeCount = await this.getActiveTokenCount(userId);
    if (activeCount >= MAX_TOKENS_PER_USER) {
      throw new BadRequestException(
        `Maximum ${MAX_TOKENS_PER_USER} active tokens allowed`,
      );
    }

    // Generate random bytes
    const randomBytes = crypto.randomBytes(24);
    const randomPart = randomBytes.toString('base64url'); // 32 chars, URL-safe

    // Calculate checksum (CRC32 → Base62)
    const checksumValue = crc32(randomBytes);
    const checksumPart = this.toBase62(checksumValue).padStart(6, '0');

    // Construct full token
    const fullToken = `${TOKEN_PREFIX}${checksumPart}_${randomPart}`;

    // Hash token with SHA-256
    const tokenHash = crypto
      .createHash('sha256')
      .update(fullToken)
      .digest('hex');

    // Get token prefix for display (first 10 chars)
    const prefix = fullToken.substring(0, 10);

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // Store in database
    const [result] = await this.db
      .insert(schema.personalAccessTokens)
      .values({
        userId,
        name,
        tokenHash,
        prefix,
        expiresAt,
      })
      .$returningId();

    // Fetch the created token
    const [tokenData] = await this.db
      .select()
      .from(schema.personalAccessTokens)
      .where(eq(schema.personalAccessTokens.id, result.id))
      .limit(1);

    if (!tokenData) {
      throw new BadRequestException('Failed to create token');
    }

    return { token: fullToken, tokenData };
  }

  /**
   * Validate a personal access token and return the associated user
   */
  async validateToken(token: string): Promise<User> {
    // Validate token format
    if (!token.startsWith(TOKEN_PREFIX)) {
      throw new UnauthorizedException('Invalid token format');
    }

    // Validate checksum
    if (!this.validateChecksum(token)) {
      throw new UnauthorizedException('Invalid token checksum');
    }

    // Hash token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find token in database
    const [tokenRecord] = await this.db
      .select()
      .from(schema.personalAccessTokens)
      .where(eq(schema.personalAccessTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid token');
    }

    // Check if revoked
    if (tokenRecord.revokedAt) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check if expired
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Get user
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, tokenRecord.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Update last used timestamp (non-blocking)
    this.updateLastUsed(tokenRecord.id);

    return user;
  }

  /**
   * List all tokens for a user (active and expired, not revoked)
   */
  async listUserTokens(userId: number): Promise<PersonalAccessToken[]> {
    const tokens = await this.db
      .select()
      .from(schema.personalAccessTokens)
      .where(
        and(
          eq(schema.personalAccessTokens.userId, userId),
          isNull(schema.personalAccessTokens.revokedAt),
        ),
      )
      .orderBy(schema.personalAccessTokens.createdAt);

    return tokens;
  }

  /**
   * Revoke a token
   */
  async revokeToken(
    tokenId: number,
    requestingUserId: number,
    requestingUserRole: User['role'],
  ): Promise<void> {
    const [token] = await this.db
      .select()
      .from(schema.personalAccessTokens)
      .where(eq(schema.personalAccessTokens.id, tokenId))
      .limit(1);

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    // Check ownership or super admin privilege
    const isSuperAdmin = requestingUserRole === 'SUPER_ADMIN';
    const isOwner = token.userId === requestingUserId;

    if (!isOwner && !isSuperAdmin) {
      throw new ForbiddenException('Cannot revoke this token');
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
          'Cannot revoke tokens for super admin users',
        );
      }
    }

    // Revoke token (soft delete)
    await this.db
      .update(schema.personalAccessTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.personalAccessTokens.id, tokenId));
  }

  /**
   * Get active token count for a user
   */
  async getActiveTokenCount(userId: number): Promise<number> {
    const now = new Date();
    const conditions: SQL[] = [
      eq(schema.personalAccessTokens.userId, userId),
      isNull(schema.personalAccessTokens.revokedAt),
    ];

    // Not expired (either no expiration or expires in future)
    const notExpiredCondition = or(
      isNull(schema.personalAccessTokens.expiresAt),
      gt(schema.personalAccessTokens.expiresAt, now),
    );

    if (notExpiredCondition) {
      conditions.push(notExpiredCondition);
    }

    const [result] = await this.db
      .select({ count: count() })
      .from(schema.personalAccessTokens)
      .where(and(...conditions));

    return result?.count || 0;
  }

  /**
   * Update last used timestamp (non-blocking)
   */
  private updateLastUsed(tokenId: number): void {
    this.db
      .update(schema.personalAccessTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.personalAccessTokens.id, tokenId))
      .then(() => {
        // Silent success
      })
      .catch(() => {
        // Silent fail - not critical
      });
  }

  /**
   * Validate token checksum
   */
  private validateChecksum(token: string): boolean {
    try {
      // Extract parts: ltv_<checksum>_<random>
      const parts = token.split('_');
      if (parts.length !== 3 || parts[0] !== 'ltv') {
        return false;
      }

      const checksumPart = parts[1];
      const randomPart = parts[2];

      // Decode random part back to bytes
      const randomBytes = Buffer.from(randomPart, 'base64url');

      // Calculate expected checksum
      const expectedChecksum = crc32(randomBytes);
      const expectedChecksumStr = this.toBase62(expectedChecksum).padStart(
        6,
        '0',
      );

      // Compare checksums (constant-time comparison)
      return crypto.timingSafeEqual(
        Buffer.from(checksumPart),
        Buffer.from(expectedChecksumStr),
      );
    } catch {
      return false;
    }
  }

  /**
   * Convert number to Base62 string
   */
  private toBase62(num: number): string {
    const chars =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    let n = num;

    do {
      result = chars[n % 62] + result;
      n = Math.floor(n / 62);
    } while (n > 0);

    return result;
  }
}
