import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
  type PaymentMethod,
  type PaymentProvider,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

export type CreateOrderResponse = {
  message: string;
  orderId: string;
  orderNumber: string;
};

export type OrderHistoryItem = {
  id: string;
  itemName: string;
  itemCategory: string;
  itemSubCategory: string;
  variant: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type OrderHistoryEntry = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  deliveryMethod: string;
  paymentMethod: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientAddress: string | null;
  note: string | null;
  subtotal: number;
  shippingFee: number;
  codFee: number;
  totalAmount: number;
  paidAt: Date | null;
  createdAt: Date;
  items: OrderHistoryItem[];
};

export type OrderHistoryResponse = {
  orders: OrderHistoryEntry[];
};

export type UpdateOrderStatusResponse = {
  message: string;
  orderId: string;
  status: string;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createOrder(
    createOrderDto: CreateOrderDto,
    userId?: string,
  ): Promise<CreateOrderResponse> {
    const normalizedItems = createOrderDto.items.map((item) => ({
      itemId: item.id.trim(),
      itemName: item.name.trim(),
      itemCategory: item.category.trim(),
      itemSubCategory: item.subCategory.trim(),
      variant: item.selectedVariant.trim(),
      unitPrice: item.finalPrice,
      quantity: item.quantity,
      lineTotal: item.finalPrice * item.quantity,
    }));

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const expectedShippingFee = this.getShippingFee(subtotal, createOrderDto.deliveryMethod);
    const expectedCodFee = this.getCodFee(
      subtotal,
      createOrderDto.deliveryMethod,
      createOrderDto.paymentMethod,
    );

    if (createOrderDto.shippingFee !== expectedShippingFee) {
      throw new BadRequestException('運費金額與目前訂單規則不一致。');
    }

    if (createOrderDto.codFee !== expectedCodFee) {
      throw new BadRequestException('貨到付款手續費與目前訂單規則不一致。');
    }

    const orderNumber = this.createOrderNumber();
    const recipientName = createOrderDto.recipientName.trim();
    const recipientPhone = createOrderDto.recipientPhone.trim();
    const recipientEmail = createOrderDto.recipientEmail.trim().toLowerCase();
    const recipientAddress = createOrderDto.recipientAddress?.trim() || null;
    const note = createOrderDto.note?.trim() || null;

    if (createOrderDto.deliveryMethod === DeliveryMethod.home && !recipientAddress) {
      throw new BadRequestException('??????????');
    }
    const totalAmount = subtotal + expectedShippingFee + expectedCodFee;

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        deliveryMethod: createOrderDto.deliveryMethod,
        paymentMethod: createOrderDto.paymentMethod,
        recipientName,
        recipientPhone,
        recipientEmail,
        recipientAddress,
        note,
        subtotal,
        shippingFee: expectedShippingFee,
        codFee: expectedCodFee,
        totalAmount,
        userId,
        items: {
          create: normalizedItems,
        },
      },
    });

    try {
      await this.notificationsService.createNewOrderNotification({
        orderId: order.id,
        orderNumber: order.orderNumber,
        recipientName: order.recipientName,
        totalAmount: order.totalAmount,
      });
    } catch (error) {
      console.error('Failed to create new order notification', error);
    }

    return {
      message: 'Order created successfully',
      orderId: order.id,
      orderNumber: order.orderNumber,
    };
  }

  async getOrderHistory(userId?: string): Promise<OrderHistoryResponse> {
    if (!userId) {
      throw new UnauthorizedException('請先登入後再查看訂單。');
    }

    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      orders: this.mapOrders(orders),
    };
  }

  async getAdminOrders(): Promise<OrderHistoryResponse> {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      orders: this.mapOrders(orders),
    };
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<UpdateOrderStatusResponse> {
    const existingOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!existingOrder) {
      throw new NotFoundException('找不到這筆訂單。');
    }

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      message: 'Order status updated successfully',
      orderId: order.id,
      status: order.status,
    };
  }

  private mapOrders(
    orders: Array<{
      id: string;
      orderNumber: string;
      status: OrderStatus;
      deliveryMethod: DeliveryMethod;
      paymentMethod: PaymentMethod;
      paymentStatus: PaymentStatus;
      paymentProvider: PaymentProvider | null;
      recipientName: string;
      recipientPhone: string;
      recipientEmail: string;
      recipientAddress: string | null;
      note: string | null;
      subtotal: number;
      shippingFee: number;
      codFee: number;
      totalAmount: number;
      paidAt: Date | null;
      createdAt: Date;
      items: Array<{
        id: string;
        itemName: string;
        itemCategory: string;
        itemSubCategory: string;
        variant: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
      }>;
    }>,
  ): OrderHistoryEntry[] {
    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      recipientEmail: order.recipientEmail,
      recipientAddress: order.recipientAddress,
      note: order.note,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      codFee: order.codFee,
      totalAmount: order.totalAmount,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        itemCategory: item.itemCategory,
        itemSubCategory: item.itemSubCategory,
        variant: item.variant,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
    }));
  }

  private getShippingFee(subtotal: number, deliveryMethod: DeliveryMethod) {
    if (deliveryMethod === DeliveryMethod.pickup) {
      return 0;
    }

    if (subtotal <= 1000) {
      return 200;
    }

    if (subtotal <= 1800) {
      return 230;
    }

    if (subtotal <= 6000) {
      return 290;
    }

    return 0;
  }

  private getCodFee(
    subtotal: number,
    deliveryMethod: DeliveryMethod,
    paymentMethod: PaymentMethod,
  ) {
    if (deliveryMethod === DeliveryMethod.pickup || paymentMethod !== 'cod') {
      return 0;
    }

    if (subtotal <= 1800) {
      return 30;
    }

    if (subtotal <= 6000) {
      return 60;
    }

    if (subtotal <= 10000) {
      return 90;
    }

    return 0;
  }

  private createOrderNumber() {
    const date = new Date();
    const yyyymmdd = `${date.getFullYear()}${`${date.getMonth() + 1}`.padStart(2, '0')}${`${date.getDate()}`.padStart(2, '0')}`;
    const suffix = `${Math.floor(Math.random() * 100000)}`.padStart(5, '0');

    return `GO${yyyymmdd}${suffix}`;
  }
}
