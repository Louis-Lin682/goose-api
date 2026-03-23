import { Module } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AdminProductsController } from './admin-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, AdminGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
