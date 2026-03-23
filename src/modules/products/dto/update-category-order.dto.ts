import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class UpdateCategoryOrderDto {
  @IsString({ message: '請輸入分類名稱。' })
  category!: string;

  @Type(() => Number)
  @IsInt({ message: '分類排序必須是整數。' })
  @Min(0, { message: '分類排序不可小於 0。' })
  categoryOrder!: number;
}
