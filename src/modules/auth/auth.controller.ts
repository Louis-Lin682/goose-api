import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthService,
  type AuthUser,
  type LoginResponse,
  type RegisterResponse,
} from './auth.service';

const AUTH_COOKIE_NAME = 'goose_session';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authService.login(loginDto);
    const sessionToken = this.authService.createSessionToken(
      result.user.id,
      Boolean(loginDto.remember),
    );

    response.cookie(AUTH_COOKIE_NAME, sessionToken, this.authService.getCookieOptions(Boolean(loginDto.remember)));

    return result;
  }

  @Get('me')
  async me(@Headers('cookie') cookieHeader?: string): Promise<{ user: AuthUser | null }> {
    const sessionToken = this.getCookieValue(cookieHeader, AUTH_COOKIE_NAME);

    if (!sessionToken) {
      return { user: null };
    }

    const user = await this.authService.getAuthenticatedUser(sessionToken);

    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response): { message: string } {
    response.clearCookie(AUTH_COOKIE_NAME, this.authService.getClearCookieOptions());

    return {
      message: 'Logout success',
    };
  }

  private getCookieValue(cookieHeader: string | undefined, key: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    const pairs = cookieHeader.split(';');

    for (const pair of pairs) {
      const [name, ...rawValue] = pair.trim().split('=');

      if (name === key) {
        return rawValue.join('=');
      }
    }

    return null;
  }
}
