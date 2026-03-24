import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '請輸入 Email。' })
  @IsEmail({}, { message: '請輸入正確的 Email。' })
  identifier: string;
}
