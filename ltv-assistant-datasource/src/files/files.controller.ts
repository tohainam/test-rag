import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { PresignedUrlRequestDto } from './dto/presigned-url-request.dto';
import { InitMultipartDto } from './dto/init-multipart.dto';
import { CompleteMultipartDto } from './dto/complete-multipart.dto';
import { GatewayAuthGuard } from '../common/guards/gateway-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/constants/roles.constant';

interface ChunksQuery {
  page?: number;
  limit?: number;
}

@Controller('files')
@UseGuards(GatewayAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('documents/:documentId/presigned-url')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  requestPresignedUrl(
    @Param('documentId') documentId: string,
    @Body(ValidationPipe) dto: PresignedUrlRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.requestPresignedUrl(
      documentId,
      dto,
      user.userId,
      user.role,
    );
  }

  @Post('documents/:documentId/init-multipart')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  initMultipartUpload(
    @Param('documentId') documentId: string,
    @Body(ValidationPipe) dto: InitMultipartDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.initMultipartUpload(
      documentId,
      dto,
      user.userId,
      user.role,
    );
  }

  @Post(':fileId/confirm-upload')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  confirmUpload(
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.confirmUpload(fileId, user.userId, user.role);
  }

  @Post(':fileId/complete-multipart')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  completeMultipartUpload(
    @Param('fileId') fileId: string,
    @Body(ValidationPipe) dto: CompleteMultipartDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.completeMultipartUpload(
      fileId,
      dto,
      user.userId,
      user.role,
    );
  }

  @Get(':fileId/download')
  getDownloadUrl(
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.getDownloadUrl(fileId, user.userId, user.role);
  }

  @Delete(':fileId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deleteFile(
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.deleteFile(fileId, user.userId, user.role);
  }

  @Get('documents/:documentId/with-status')
  getFilesWithIndexingStatus(
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.getFilesWithIndexingStatus(
      documentId,
      user.userId,
      user.role,
    );
  }

  @Get(':fileId/details')
  getFileDetails(
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.getFileDetails(fileId, user.userId, user.role);
  }

  @Get(':fileId/parent-chunks')
  getParentChunks(
    @Param('fileId') fileId: string,
    @Query() query: ChunksQuery,
    @CurrentUser() user: CurrentUserData,
  ) {
    const pageNum = query.page ?? 1;
    const limitNum = query.limit ?? 20;
    return this.filesService.getParentChunks(
      fileId,
      pageNum,
      limitNum,
      user.userId,
      user.role,
    );
  }

  @Get(':fileId/child-chunks')
  getChildChunks(
    @Param('fileId') fileId: string,
    @Query() query: ChunksQuery,
    @CurrentUser() user: CurrentUserData,
  ) {
    const pageNum = query.page ?? 1;
    const limitNum = query.limit ?? 50;
    return this.filesService.getChildChunks(
      fileId,
      pageNum,
      limitNum,
      user.userId,
      user.role,
    );
  }

  @Post(':fileId/retry')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  retryFileIndexing(
    @Param('fileId') fileId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.filesService.retryFileIndexing(fileId, user.userId, user.role);
  }
}
