import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
export class UpdateProductDto {
  @IsOptional()
  @IsString({ message: 'Category must be a string.' })
  category?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Category order must be an integer.' })
  @Min(0, { message: 'Category order must be greater than or equal to 0.' })
  categoryOrder?: number;
  @IsOptional()
  @IsString({ message: 'Sub-category must be a string.' })
  subCategory?: string;
  @IsOptional()
  @IsString({ message: 'Product name must be a string.' })
  name?: string;
  @IsOptional()
  @IsString({ message: 'Image URL must be a string.' })
  imageUrl?: string | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Price must be an integer.' })
  @Min(0, { message: 'Price must be greater than or equal to 0.' })
  price?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Small size price must be an integer.' })
  @Min(0, { message: 'Small size price must be greater than or equal to 0.' })
  priceSmall?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Large size price must be an integer.' })
  @Min(0, { message: 'Large size price must be greater than or equal to 0.' })
  priceLarge?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sort order must be an integer.' })
  @Min(0, { message: 'Sort order must be greater than or equal to 0.' })
  sortOrder?: number;
}
