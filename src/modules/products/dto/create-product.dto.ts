import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
export class CreateProductDto {
  @IsString({ message: 'Category is required.' })
  category!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Category order must be an integer.' })
  @Min(0, { message: 'Category order must be greater than or equal to 0.' })
  categoryOrder?: number;
  @IsString({ message: 'Sub-category is required.' })
  subCategory!: string;
  @IsString({ message: 'Product name is required.' })
  name!: string;
  @IsOptional()
  @IsString({ message: 'Description must be a string.' })
  description?: string;
  @IsOptional()
  @IsString({ message: 'Image URL must be a string.' })
  imageUrl?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Price must be an integer.' })
  @Min(0, { message: 'Price must be greater than or equal to 0.' })
  price?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Small size price must be an integer.' })
  @Min(0, { message: 'Small size price must be greater than or equal to 0.' })
  priceSmall?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Large size price must be an integer.' })
  @Min(0, { message: 'Large size price must be greater than or equal to 0.' })
  priceLarge?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer.' })
  @Min(0, { message: 'Sort order must be greater than or equal to 0.' })
  sortOrder?: number;
}

