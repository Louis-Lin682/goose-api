import { IsString, MinLength } from 'class-validator';

export class CreateEcpayCheckoutDto {
  @IsString({ message: '請提供訂單 ID。' })
  @MinLength(1, { message: '請提供訂單 ID。' })
  orderId!: string;
}

