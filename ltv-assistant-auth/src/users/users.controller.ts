import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  BadRequestException,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schema';
import { UsersService } from './users.service';
import { GetUsersQueryDto, UpdateUserRoleDto } from './dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.usersService.getUsers(query);
  }

  @Get('search')
  async searchUsers(@Query('q') searchQuery: string) {
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }
    return this.usersService.searchUsers(searchQuery);
  }

  @Patch(':id/role')
  async updateUserRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
  ) {
    const user = await this.usersService.getUserById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot change role for super admins
    if (user.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot change role for super admin');
    }

    // Cannot change role to super admin
    if (body.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot assign super admin role');
    }

    return this.usersService.updateUserRole(id, body.role);
  }
}
