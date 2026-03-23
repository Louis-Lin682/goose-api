import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminNotificationEntry = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  orderId: string | null;
  orderNumber: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export type AdminNotificationsResponse = {
  notifications: AdminNotificationEntry[];
  unreadCount: number;
};

export type MarkNotificationReadResponse = {
  message: string;
  notificationId: string;
};

export type MarkAllNotificationsReadResponse = {
  message: string;
  updatedCount: number;
};

type NewOrderNotificationInput = {
  orderId: string;
  orderNumber: string;
  recipientName: string;
  totalAmount: number;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNewOrderNotification(
    input: NewOrderNotificationInput,
  ): Promise<void> {
    const adminUsers = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    if (adminUsers.length === 0) {
      return;
    }

    await this.prisma.notification.create({
      data: {
        type: NotificationType.NEW_ORDER,
        title: `新訂單 ${input.orderNumber}`,
        message: `${input.recipientName} 建立了新訂單，訂單金額 $${input.totalAmount}。`,
        orderId: input.orderId,
        recipients: {
          create: adminUsers.map((adminUser) => ({
            userId: adminUser.id,
          })),
        },
      },
    });
  }

  async getAdminNotifications(userId: string): Promise<AdminNotificationsResponse> {
    const [recipients, unreadCount] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where: {
          userId,
        },
        orderBy: {
          notification: {
            createdAt: 'desc',
          },
        },
        include: {
          notification: {
            select: {
              id: true,
              type: true,
              title: true,
              message: true,
              orderId: true,
              order: {
                select: {
                  orderNumber: true,
                },
              },
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.notificationRecipient.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    return {
      notifications: recipients.map((recipient) => ({
        id: recipient.notification.id,
        type: recipient.notification.type,
        title: recipient.notification.title,
        message: recipient.notification.message,
        orderId: recipient.notification.orderId,
        orderNumber: recipient.notification.order?.orderNumber ?? null,
        isRead: recipient.isRead,
        readAt: recipient.readAt,
        createdAt: recipient.notification.createdAt,
      })),
      unreadCount,
    };
  }

  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<MarkNotificationReadResponse> {
    const recipient = await this.prisma.notificationRecipient.findUnique({
      where: {
        notificationId_userId: {
          notificationId,
          userId,
        },
      },
      select: {
        notificationId: true,
      },
    });

    if (!recipient) {
      throw new NotFoundException('找不到指定通知。');
    }

    await this.prisma.notificationRecipient.update({
      where: {
        notificationId_userId: {
          notificationId,
          userId,
        },
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: 'Notification marked as read',
      notificationId,
    };
  }

  async markAllAsRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    const result = await this.prisma.notificationRecipient.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }
}
