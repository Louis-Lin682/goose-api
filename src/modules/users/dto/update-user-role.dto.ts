import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserRoleDto {
  @IsEnum(UserRole, { message: '會員角色不正確。' })
  role!: UserRole;
}
