import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^09\d{8}$/, { message: '請輸入正確的手機號碼格式。' })
  phone: string;

  @IsEmail({}, { message: '請輸入正確的 Email 格式。' })
  email: string;

  @IsString()
  @MinLength(8, { message: '密碼至少需要 8 碼。' })
  password: string;
}
