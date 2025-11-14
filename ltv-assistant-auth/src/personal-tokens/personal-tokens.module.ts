import { Module } from '@nestjs/common';
import { PersonalTokensService } from './personal-tokens.service';
import { PersonalTokensController } from './personal-tokens.controller';
import { PersonalTokensAdminController } from './personal-tokens-admin.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PersonalTokensController, PersonalTokensAdminController],
  providers: [PersonalTokensService],
  exports: [PersonalTokensService],
})
export class PersonalTokensModule {}
