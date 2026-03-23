import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import type { CookieOptions } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

type SessionPayload = {
  sub: string;
  exp: number;
};

type AuthUserRecord = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
};

export type AuthUser = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
};

export type RegisterResponse = {
  message: string;
};

export type LoginResponse = {
  message: string;
  user: AuthUser;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(registerDto: RegisterDto): Promise<RegisterResponse> {
    const name = registerDto.name.trim();
    const phone = registerDto.phone.trim();
    const email = registerDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email }],
      },
    });

    if (existingUser?.phone === phone) {
      throw new ConflictException('Phone number is already registered.');
    }

    if (existingUser?.email === email) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    await this.prisma.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash,
        role: this.resolveBootstrapRole({ email, phone }),
      },
    });

    return {
      message: 'Register success',
    };
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const identifier = loginDto.identifier.trim();
    const normalizedEmail = identifier.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: identifier }, { email: normalizedEmail }],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        passwordHash: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid phone, email, or password.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, loginDto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid phone, email, or password.');
    }

    const syncedUser = await this.syncBootstrapAdminRole({
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
    });

    return {
      message: 'Login success',
      user: this.toAuthUser(syncedUser),
    };
  }

  async getAuthenticatedUser(sessionToken: string): Promise<AuthUser> {
    const payload = this.verifySessionToken(sessionToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    const syncedUser = await this.syncBootstrapAdminRole(user);
    return this.toAuthUser(syncedUser);
  }

  createSessionToken(userId: string, remember: boolean): string {
    const expiresAt = Date.now() + (remember ? SEVEN_DAYS_IN_MS : ONE_DAY_IN_MS);
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        exp: expiresAt,
      } satisfies SessionPayload),
      'utf8',
    ).toString('base64url');
    const signature = this.signPayload(payload);

    return `${payload}.${signature}`;
  }

  getCookieOptions(remember: boolean): CookieOptions {
    return {
      ...this.getCookieBaseOptions(),
      maxAge: remember ? SEVEN_DAYS_IN_MS : ONE_DAY_IN_MS,
    };
  }

  getClearCookieOptions(): CookieOptions {
    return this.getCookieBaseOptions();
  }

  private getCookieBaseOptions(): CookieOptions {
    const secure = process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      sameSite: secure ? 'none' : 'lax',
      secure,
      path: '/',
    };
  }

  private verifySessionToken(sessionToken: string): SessionPayload {
    const [payloadPart, signaturePart] = sessionToken.split('.');

    if (!payloadPart || !signaturePart) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    const expectedSignature = this.signPayload(payloadPart);
    const providedSignature = Buffer.from(signaturePart, 'utf8');
    const safeExpectedSignature = Buffer.from(expectedSignature, 'utf8');

    if (
      providedSignature.length !== safeExpectedSignature.length ||
      !timingSafeEqual(providedSignature, safeExpectedSignature)
    ) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    const decoded = Buffer.from(payloadPart, 'base64url').toString('utf8');
    const payload = this.parseSessionPayload(decoded);

    if (!payload.sub || !payload.exp || payload.exp < Date.now()) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    return payload;
  }

  private parseSessionPayload(value: string): SessionPayload {
    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('sub' in parsed) ||
      !('exp' in parsed) ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    return {
      sub: parsed.sub,
      exp: parsed.exp,
    };
  }

  private signPayload(payload: string): string {
    const secret =
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-change-me');

    if (!secret) {
      throw new InternalServerErrorException('AUTH_SECRET is missing.');
    }

    return createHmac('sha256', secret).update(payload).digest('base64url');
  }

  private resolveBootstrapRole(user: { email: string; phone: string }): UserRole {
    return this.isBootstrapAdmin(user) ? UserRole.ADMIN : UserRole.CUSTOMER;
  }

  private async syncBootstrapAdminRole(user: AuthUserRecord): Promise<AuthUserRecord> {
    if (user.role === UserRole.ADMIN || !this.isBootstrapAdmin(user)) {
      return user;
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { role: UserRole.ADMIN },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
      },
    });
  }

  private isBootstrapAdmin(user: { email: string; phone: string }): boolean {
    const normalizedEmail = user.email.trim().toLowerCase();
    const normalizedPhone = user.phone.trim();
    const allowedEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const allowedPhones = (process.env.ADMIN_PHONES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return allowedPhones.includes(normalizedPhone) || allowedEmails.includes(normalizedEmail);
  }

  private toAuthUser(user: AuthUserRecord): AuthUser {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isAdmin: user.role === UserRole.ADMIN,
    };
  }
}
