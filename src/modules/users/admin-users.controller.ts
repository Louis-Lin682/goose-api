import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import {
  UsersService,
  type AdminUsersResponse,
  type UpdateUserRoleResponse,
} from './users.service';

@UseGuards(AdminGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAdminUsers(): Promise<AdminUsersResponse> {
    return this.usersService.getAdminUsers();
  }

  @Patch(':userId/role')
  updateUserRole(
    @Param('userId') userId: string,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<UpdateUserRoleResponse> {
    return this.usersService.updateUserRole(
      userId,
      updateUserRoleDto.role as UserRole,
    );
  }
}
