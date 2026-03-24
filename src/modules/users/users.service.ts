import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

export type AdminUserEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string | null;
  lineUserId: string | null;
  linePictureUrl: string | null;
  isLineLinked: boolean;
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

export type UpdateAdminUserResponse = {
  message: string;
  user: AdminUserEntry;
};

export type DeleteAdminUserResponse = {
  message: string;
  userId: string;
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
      users: users.map((user) => this.toAdminUserEntry(user)),
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
      throw new NotFoundException('User not found.');
    }

    if (user.role === role) {
      return {
        message: 'User role is already up to date.',
        userId: user.id,
        role: user.role,
      };
    }

    if (user.role === UserRole.ADMIN && role === UserRole.CUSTOMER) {
      await this.ensureAdminWillRemain();
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
      message: 'User role updated successfully.',
      userId: updatedUser.id,
      role: updatedUser.role,
    };
  }

  async updateAdminUser(
    userId: string,
    updateAdminUserDto: UpdateAdminUserDto,
  ): Promise<UpdateAdminUserResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const name = updateAdminUserDto.name.trim();
    const phone = updateAdminUserDto.phone.trim();
    const email = updateAdminUserDto.email.trim().toLowerCase();
    const address = updateAdminUserDto.address?.trim() || null;

    const duplicateUser = await this.prisma.user.findFirst({
      where: {
        id: { not: userId },
        OR: [{ phone }, { email }],
      },
    });

    if (duplicateUser?.phone === phone) {
      throw new ConflictException('Phone number is already registered.');
    }

    if (duplicateUser?.email === email) {
      throw new ConflictException('Email is already registered.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone,
        email,
        address,
      },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    return {
      message: 'User profile updated successfully.',
      user: this.toAdminUserEntry(updatedUser),
    };
  }

  async deleteAdminUser(userId: string): Promise<DeleteAdminUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        lineUserId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.role === UserRole.ADMIN) {
      await this.ensureAdminWillRemain();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { userId },
        data: { userId: null },
      });

      await tx.passwordResetToken.deleteMany({
        where: { userId },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return {
      message: user.lineUserId
        ? 'LINE linked member deleted successfully.'
        : 'User deleted successfully.',
      userId,
    };
  }

  private async ensureAdminWillRemain() {
    const adminCount = await this.prisma.user.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount <= 1) {
      throw new BadRequestException('At least one admin must remain.');
    }
  }

  private toAdminUserEntry(user: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string | null;
    lineUserId: string | null;
    linePictureUrl: string | null;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
    _count: { orders: number };
  }): AdminUserEntry {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      address: user.address,
      lineUserId: user.lineUserId,
      linePictureUrl: user.linePictureUrl,
      isLineLinked: Boolean(user.lineUserId),
      role: user.role,
      orderCount: user._count.orders,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
