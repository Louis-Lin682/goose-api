import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminUserEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  orderCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminUsersResponse = {
  users: AdminUserEntry[];
};

export type UpdateUserRoleResponse = {
  message: string;
  userId: string;
  role: UserRole;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminUsers(): Promise<AdminUsersResponse> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        orderCount: user._count.orders,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    };
  }

  async updateUserRole(
    userId: string,
    role: UserRole,
  ): Promise<UpdateUserRoleResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('找不到這位會員。');
    }

    if (user.role === role) {
      return {
        message: '會員角色沒有變更',
        userId: user.id,
        role: user.role,
      };
    }

    if (user.role === UserRole.ADMIN && role === UserRole.CUSTOMER) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('至少需要保留一位管理員。');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        role: true,
      },
    });

    return {
      message: '會員角色更新成功',
      userId: updatedUser.id,
      role: updatedUser.role,
    };
  }
}
