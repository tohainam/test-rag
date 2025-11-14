import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, gt } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import { User, NewUser } from '../database/schema';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateGoogleUser(
    googleUser: Omit<NewUser, 'createdAt' | 'updatedAt'>,
  ): Promise<User> {
    const [existingUser] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.googleId, googleUser.googleId))
      .limit(1);

    if (existingUser) {
      // Update user info in case it changed
      await this.db
        .update(schema.users)
        .set({
          name: googleUser.name,
          avatar: googleUser.avatar,
        })
        .where(eq(schema.users.id, existingUser.id));

      // Fetch the updated user
      const [updatedUser] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, existingUser.id))
        .limit(1);

      if (!updatedUser) {
        throw new UnauthorizedException('Failed to update user');
      }

      return updatedUser;
    }

    // Create new user
    const [newUser] = await this.db
      .insert(schema.users)
      .values(googleUser)
      .$returningId();

    const [createdUser] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, newUser.id))
      .limit(1);

    if (!createdUser) {
      throw new UnauthorizedException('Failed to create user');
    }

    return createdUser;
  }

  async getUserById(userId: number): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return user || null;
  }

  generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    return this.jwtService.sign(payload);
  }

  async generateRefreshToken(
    user: User,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() +
        parseInt(
          this.configService.get<string>('JWT_REFRESH_EXPIRATION', '8h'),
        ),
    );

    await this.db.insert(schema.refreshTokens).values({
      userId: user.id,
      token,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      lastUsedAt: new Date(),
      expiresAt,
    });

    return token;
  }

  async validateRefreshToken(token: string): Promise<User> {
    const [refreshToken] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.token, token),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Update last used timestamp
    await this.db
      .update(schema.refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.refreshTokens.id, refreshToken.id));

    const user = await this.getUserById(refreshToken.userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.token, token));
  }

  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.db
      .delete(schema.refreshTokens)
      .where(eq(schema.refreshTokens.userId, userId));
  }

  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();
    await this.db
      .delete(schema.refreshTokens)
      .where(gt(schema.refreshTokens.expiresAt, now));
  }
}
