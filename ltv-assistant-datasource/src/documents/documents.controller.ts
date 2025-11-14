import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import type { PaginationQuery } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AddUserToDocumentDto } from './dto/add-user-to-document.dto';
import { GatewayAuthGuard } from '../common/guards/gateway-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants/roles.constant';

@Controller('documents')
@UseGuards(GatewayAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body(ValidationPipe) createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.create(createDocumentDto, user.userId);
  }

  @Get()
  findAll(
    @Query() query: PaginationQuery,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.findAll(query, user.userId, user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.documentsService.findOne(id, user.userId, user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.update(
      id,
      updateDocumentDto,
      user.userId,
      user.role,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.documentsService.remove(id, user.userId, user.role);
  }

  // Document user access management
  @Get(':id/users')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getDocumentUsers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.getDocumentUsers(id, user.userId, user.role);
  }

  @Post(':id/users')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  addUserToDocument(
    @Param('id') id: string,
    @Body(ValidationPipe) addUserDto: AddUserToDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.addUserToDocument(
      id,
      addUserDto.userId,
      user.userId,
      user.role,
      addUserDto.expiresAt,
    );
  }

  @Delete(':id/users/:userId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  removeUserFromDocument(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documentsService.removeUserFromDocument(
      id,
      userId,
      user.userId,
      user.role,
    );
  }
}
