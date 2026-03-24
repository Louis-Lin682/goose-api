import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAdminUserDto {
  @IsString({ message: 'Please enter a valid name.' })
  @MinLength(2, { message: 'Name must be at least 2 characters long.' })
  @MaxLength(30, { message: 'Name must be 30 characters or fewer.' })
  name!: string;

  @Matches(/^09\d{8}$/, {
    message: 'Please enter a valid Taiwanese mobile phone number.',
  })
  phone!: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsOptional()
  @IsString({ message: 'Address must be text.' })
  @MaxLength(255, { message: 'Address must be 255 characters or fewer.' })
  address?: string | null;
}
