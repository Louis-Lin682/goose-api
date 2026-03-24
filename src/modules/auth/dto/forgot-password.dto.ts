import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your phone number or email.' })
  identifier: string;
}
