import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  OrdersService,
  type OrderHistoryResponse,
  type UpdateOrderStatusResponse,
} from './orders.service';

@UseGuards(AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getAdminOrders(): Promise<OrderHistoryResponse> {
    return this.ordersService.getAdminOrders();
  }

  @Patch(':orderId/status')
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<UpdateOrderStatusResponse> {
    return this.ordersService.updateOrderStatus(
      orderId,
      updateOrderStatusDto.status as OrderStatus,
    );
  }
}
