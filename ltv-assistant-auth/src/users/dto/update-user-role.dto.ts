import { IsEnum } from 'class-validator';
import { UserRole } from '../../database/schema';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
