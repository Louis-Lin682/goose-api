import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @MinLength(8, { message: '密碼至少需要 8 碼。' })
  password: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
