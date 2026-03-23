import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryMethod, PaymentMethod } from '@prisma/client';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  subCategory: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  selectedVariant: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalPrice: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @IsString()
  @Matches(/^09\d{8}$/, { message: '請輸入正確的手機號碼格式。' })
  recipientPhone: string;

  @IsEmail({}, { message: '請輸入正確的 Email 格式。' })
  recipientEmail: string;

  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  shippingFee: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  codFee: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
