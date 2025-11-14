import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PersonalTokensService } from './personal-tokens.service';
import { CreateTokenDto, TokenResponseDto, TokenListItemDto } from './dto';
import { User, UserRole } from '../database/schema';

@Controller('admin/personal-tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PersonalTokensAdminController {
  constructor(private personalTokensService: PersonalTokensService) {}

  @Get('user/:userId')
  async listUserTokens(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<TokenListItemDto[]> {
    const tokens = await this.personalTokensService.listUserTokens(userId);

    return tokens.map((token) => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      isExpired: token.expiresAt ? token.expiresAt < new Date() : false,
      createdAt: token.createdAt,
    }));
  }

  @Post('user/:userId')
  async createTokenForUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CreateTokenDto,
  ): Promise<TokenResponseDto> {
    const { token, tokenData } = await this.personalTokensService.generateToken(
      userId,
      dto.name,
      dto.expiresInDays ?? null,
    );

    return {
      token,
      id: tokenData.id,
      name: tokenData.name,
      prefix: tokenData.prefix,
      expiresAt: tokenData.expiresAt,
      createdAt: tokenData.createdAt,
    };
  }

  @Delete(':id')
  async revokeToken(
    @Req() req: Request & { user: User },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ message: string }> {
    await this.personalTokensService.revokeToken(
      id,
      req.user.id,
      req.user.role,
    );

    return { message: 'Token revoked successfully' };
  }
}
