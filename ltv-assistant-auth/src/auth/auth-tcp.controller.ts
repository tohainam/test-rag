import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PersonalTokensService } from '../personal-tokens/personal-tokens.service';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AuthTcpController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private personalTokensService: PersonalTokensService,
    private configService: ConfigService,
  ) {}

  @MessagePattern({ cmd: 'verify_token' })
  async verifyToken(@Payload() data: { token: string }) {
    try {
      // Check if it's a personal token (starts with 'ltv_')
      if (data.token.startsWith('ltv_')) {
        try {
          const user = await this.personalTokensService.validateToken(
            data.token,
          );
          return {
            success: true,
            user: {
              userId: user.id,
              email: user.email,
              role: user.role,
            },
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Invalid personal token';
          return { success: false, error: errorMessage };
        }
      }

      // Otherwise, treat as JWT token
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        return { success: false, error: 'JWT secret not configured' };
      }
      const payload = jwt.verify(data.token, secret) as unknown as {
        sub: number;
        email: string;
      };

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        user: {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  @MessagePattern({ cmd: 'get_user_by_id' })
  async getUserById(@Payload() data: { user_id: string }) {
    try {
      const user = await this.usersService.findById(Number(data.user_id));
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  @MessagePattern({ cmd: 'verify_user_role' })
  async verifyUserRole(
    @Payload() data: { user_id: string; required_roles: string[] },
  ) {
    try {
      const user = await this.usersService.findById(Number(data.user_id));
      if (!user) {
        return { success: false, hasRole: false, error: 'User not found' };
      }

      const hasRole = data.required_roles.includes(user.role);
      return { success: true, hasRole, userRole: user.role };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, hasRole: false, error: errorMessage };
    }
  }

  @MessagePattern({ cmd: 'get_user_by_email' })
  async getUserByEmail(@Payload() data: { email: string }) {
    try {
      const user = await this.usersService.findByEmail(data.email);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  @MessagePattern({ cmd: 'get_users_by_ids' })
  async getUsersByIds(@Payload() data: { userIds: string[] }) {
    try {
      const userIds = data.userIds.map((id) => Number(id));
      const users = await this.usersService.getUsersByIds(userIds);

      return {
        success: true,
        users: users.map((user) => ({
          id: String(user.id),
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
        })),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, users: [] };
    }
  }
}
