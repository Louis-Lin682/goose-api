import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  OrdersService,
  type AdminProductStatsPreset,
  type AdminProductStatsResponse,
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

  @Get('product-stats')
  getAdminProductStats(
    @Query('preset') preset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AdminProductStatsResponse> {
    return this.ordersService.getAdminProductStats({
      preset: (preset as AdminProductStatsPreset | undefined) ?? 'today',
      startDate,
      endDate,
    });
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
