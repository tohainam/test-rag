import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshTokenListItemDto } from './dto';
import { User, UserRole } from '../database/schema';

@Controller('admin/refresh-tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class RefreshTokensAdminController {
  constructor(private refreshTokensService: RefreshTokensService) {}

  @Get('user/:userId')
  async listUserRefreshTokens(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<RefreshTokenListItemDto[]> {
    const tokens =
      await this.refreshTokensService.listUserRefreshTokens(userId);

    return tokens.map((token) => ({
      id: token.id,
      userAgent: token.userAgent,
      ipAddress: token.ipAddress,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    }));
  }

  @Delete(':id')
  async revokeRefreshToken(
    @Req() req: Request & { user: User },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.refreshTokensService.revokeRefreshToken(
      id,
      req.user.id,
      req.user.role,
    );

    return { message: 'Refresh token revoked successfully' };
  }
}
