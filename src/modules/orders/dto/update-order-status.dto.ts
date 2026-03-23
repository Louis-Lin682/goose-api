import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: '訂單狀態不正確。' })
  status!: OrderStatus;
}
