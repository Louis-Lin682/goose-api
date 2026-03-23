import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminNotificationsController],
  providers: [NotificationsService, AdminGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
