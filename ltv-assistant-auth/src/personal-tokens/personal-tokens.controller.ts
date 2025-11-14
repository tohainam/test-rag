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
import { PersonalTokensService } from './personal-tokens.service';
import { CreateTokenDto, TokenResponseDto, TokenListItemDto } from './dto';
import { User } from '../database/schema';

@Controller('personal-tokens')
@UseGuards(JwtAuthGuard)
export class PersonalTokensController {
  constructor(private personalTokensService: PersonalTokensService) {}

  @Get()
  async listTokens(
    @Req() req: Request & { user: User },
  ): Promise<TokenListItemDto[]> {
    const tokens = await this.personalTokensService.listUserTokens(req.user.id);

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

  @Post()
  async createToken(
    @Req() req: Request & { user: User },
    @Body() dto: CreateTokenDto,
  ): Promise<TokenResponseDto> {
    const { token, tokenData } = await this.personalTokensService.generateToken(
      req.user.id,
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
