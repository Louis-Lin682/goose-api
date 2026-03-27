import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, PaymentProvider, PaymentStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

type EcpayCheckoutFieldMap = Record<string, string>;

export type EcpayCheckoutResponse = {
  action: string;
  method: 'POST';
  fields: EcpayCheckoutFieldMap;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIv: string;
  private readonly checkoutAction: string;
  private readonly backendBaseUrl: string;
  private readonly frontendBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.merchantId = this.configService.get<string>('ECPAY_MERCHANT_ID') ?? '2000132';
    this.hashKey = this.configService.get<string>('ECPAY_HASH_KEY') ?? '5294y06JbISpM5x9';
    this.hashIv = this.configService.get<string>('ECPAY_HASH_IV') ?? 'v77hoKGq4kWxNNIS';
    this.checkoutAction =
      this.configService.get<string>('ECPAY_CHECKOUT_ACTION') ??
      'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

    const port = this.configService.get<string>('PORT') ?? '3001';
    this.backendBaseUrl =
      this.configService.get<string>('BACKEND_BASE_URL') ?? `http://localhost:${port}`;
    this.frontendBaseUrl =
      this.configService.get<string>('FRONTEND_APP_URL')?.split(',')[0]?.trim() ||
      this.configService.get<string>('FRONTEND_ORIGIN')?.split(',')[0]?.trim() ||
      'http://localhost:5173';
  }

  async createEcpayCheckout(
    orderId: string,
    userId?: string,
  ): Promise<EcpayCheckoutResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('找不到指定的訂單。');
    }

    if (order.userId && userId && order.userId !== userId) {
      throw new ForbiddenException('你無法替其他會員的訂單建立付款。');
    }

    if (!order.userId && userId === undefined) {
      throw new ForbiddenException('請先登入後再建立付款。');
    }

    if (order.paymentMethod !== PaymentMethod.online) {
      throw new BadRequestException('只有線上付款的訂單可以導向綠界。');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('這筆訂單已完成付款。');
    }

    if (!this.merchantId || !this.hashKey || !this.hashIv) {
      throw new InternalServerErrorException('綠界付款設定不完整。');
    }

    const merchantTradeNo = order.merchantTradeNo ?? order.orderNumber;

    if (!order.merchantTradeNo || order.paymentProvider !== PaymentProvider.ECPAY) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          merchantTradeNo,
          paymentProvider: PaymentProvider.ECPAY,
          paymentStatus: PaymentStatus.UNPAID,
        },
      });
    }

    const fields: EcpayCheckoutFieldMap = {
      MerchantID: this.merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: this.formatTradeDate(new Date()),
      PaymentType: 'aio',
      TotalAmount: `${order.totalAmount}`,
      TradeDesc: 'Goose order payment',
      ItemName: this.buildItemName(order.items.map((item) => item.itemName)),
      ReturnURL:
        this.configService.get<string>('ECPAY_RETURN_URL') ??
        `${this.backendBaseUrl}/payments/ecpay/notify`,
      OrderResultURL:
        this.configService.get<string>('ECPAY_ORDER_RESULT_URL') ??
        `${this.backendBaseUrl}/payments/ecpay/result`,
      ClientBackURL:
        this.configService.get<string>('ECPAY_CLIENT_BACK_URL') ??
        `${this.frontendBaseUrl}/orders`,
      ChoosePayment: 'Credit',
      EncryptType: '1',
      NeedExtraPaidInfo: 'Y',
      CustomField1: order.id,
      CustomField2: order.orderNumber,
    };

    fields.CheckMacValue = this.generateCheckMacValue(fields);

    this.logger.log(
      `ECPay checkout fields: ${JSON.stringify({
        MerchantID: fields.MerchantID,
        MerchantTradeNo: fields.MerchantTradeNo,
        ReturnURL: fields.ReturnURL,
        OrderResultURL: fields.OrderResultURL,
        ClientBackURL: fields.ClientBackURL,
        TotalAmount: fields.TotalAmount,
        ItemName: fields.ItemName,
      })}`,
    );

    return {
      action: this.checkoutAction,
      method: 'POST',
      fields,
    };
  }

  async buildEcpayResultRedirectUrl(payload: Record<string, string>): Promise<string> {
    this.logger.log(
      `ECPay order result received: ${JSON.stringify({
        MerchantTradeNo: payload.MerchantTradeNo,
        TradeNo: payload.TradeNo,
        RtnCode: payload.RtnCode,
        RtnMsg: payload.RtnMsg,
        PaymentType: payload.PaymentType,
      })}`,
    );

    if (payload.RtnCode === '1') {
      await this.markOrderPaidFromEcpayPayload(payload);
    }

    const redirectUrl = new URL('/payment/ecpay/result', this.frontendBaseUrl);

    Object.entries(payload).forEach(([key, value]) => {
      if (typeof value === 'string' && value !== '') {
        redirectUrl.searchParams.set(key, value);
      }
    });

    return redirectUrl.toString();
  }

  async simulateEcpayPaid(orderId: string): Promise<{
    message: string;
    orderId: string;
    orderNumber: string;
    status: OrderStatus;
  }> {
    if ((this.configService.get<string>('NODE_ENV') ?? 'development') === 'production') {
      throw new ForbiddenException('正式環境不允許使用模擬付款。');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      throw new NotFoundException('找不到指定的訂單。');
    }

    if (order.paymentMethod !== PaymentMethod.online) {
      throw new BadRequestException('只有線上付款的訂單可以模擬付款成功。');
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.PENDING,
          tradeNo: `SIMULATED-${Date.now()}`,
          paidAt: new Date(),
          paymentProvider: PaymentProvider.ECPAY,
        },
      });
    }

    this.logger.log(`ECPay simulated paid for order ${order.orderNumber}`);

    return {
      message: '模擬付款成功。',
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: OrderStatus.PENDING,
    };
  }

  async handleEcpayNotification(payload: Record<string, string>): Promise<string> {
    this.logger.log(
      `ECPay notify received: ${JSON.stringify({
        MerchantTradeNo: payload.MerchantTradeNo,
        TradeNo: payload.TradeNo,
        RtnCode: payload.RtnCode,
        RtnMsg: payload.RtnMsg,
        PaymentDate: payload.PaymentDate,
        SimulatePaid: payload.SimulatePaid,
      })}`,
    );

    const receivedCheckMacValue = payload.CheckMacValue;

    if (!receivedCheckMacValue) {
      this.logger.warn('Missing CheckMacValue in ECPay notification');
      throw new BadRequestException('Missing CheckMacValue');
    }

    const { CheckMacValue: _omitted, ...restPayload } = payload;
    const expectedCheckMacValue = this.generateCheckMacValue(restPayload);

    if (expectedCheckMacValue !== receivedCheckMacValue) {
      this.logger.warn('Invalid CheckMacValue from ECPay notification');
      throw new BadRequestException('Invalid CheckMacValue');
    }

    if (payload.RtnCode === '1') {
      await this.markOrderPaidFromEcpayPayload(payload);
    }

    return '1|OK';
  }

  private async markOrderPaidFromEcpayPayload(payload: Record<string, string>): Promise<void> {
    const merchantTradeNo = payload.MerchantTradeNo;

    if (!merchantTradeNo) {
      throw new BadRequestException('Missing MerchantTradeNo');
    }

    const order = await this.prisma.order.findUnique({
      where: { merchantTradeNo },
      select: {
        id: true,
        orderNumber: true,
        recipientName: true,
        totalAmount: true,
        paymentStatus: true,
        notifications: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('找不到對應的訂單。');
    }

    const hasExistingNotification = order.notifications.length > 0;

    if (order.paymentStatus !== PaymentStatus.PAID) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.PENDING,
          tradeNo: payload.TradeNo || null,
          paidAt: new Date(),
          paymentProvider: PaymentProvider.ECPAY,
        },
      });
    }

    if (!hasExistingNotification) {
      try {
        await this.notificationsService.createNewOrderNotification({
          orderId: order.id,
          orderNumber: order.orderNumber,
          recipientName: order.recipientName,
          totalAmount: order.totalAmount,
        });
      } catch (error) {
        this.logger.error(
          'Failed to create paid-order notification for ' + order.orderNumber,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private buildItemName(itemNames: string[]): string {
    const fallback = 'Goose order';
    const joined = itemNames.filter(Boolean).join('#').trim();

    if (!joined) {
      return fallback;
    }

    return joined.length > 200 ? `${joined.slice(0, 197)}...` : joined;
  }

  private formatTradeDate(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const date = `${value.getDate()}`.padStart(2, '0');
    const hours = `${value.getHours()}`.padStart(2, '0');
    const minutes = `${value.getMinutes()}`.padStart(2, '0');
    const seconds = `${value.getSeconds()}`.padStart(2, '0');

    return `${year}/${month}/${date} ${hours}:${minutes}:${seconds}`;
  }

  private generateCheckMacValue(fields: Record<string, string>): string {
    const sortedEntries = Object.entries(fields)
      .filter((entry) => entry[0] !== 'CheckMacValue')
      .map(([key, value]) => [key, value ?? ''] as const)
      .sort((left, right) => (left[0] > right[0] ? 1 : -1));

    const queryString = sortedEntries
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');

    const raw = `HashKey=${this.hashKey}&${queryString}&HashIV=${this.hashIv}`;
    const encoded = this.toEcpayEncodedValue(raw);

    return createHash('sha256').update(encoded).digest('hex').toUpperCase();
  }

  private toEcpayEncodedValue(value: string): string {
    return encodeURIComponent(value)
      .toLowerCase()
      .replace(/%20/g, '+')
      .replace(/%2d/g, '-')
      .replace(/%5f/g, '_')
      .replace(/%2e/g, '.')
      .replace(/%21/g, '!')
      .replace(/%2a/g, '*')
      .replace(/%28/g, '(')
      .replace(/%29/g, ')');
  }
}
