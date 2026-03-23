import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [UsersService, AdminGuard],
})
export class UsersModule {}
