import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private signToken(user: {
    id: string;
    username: string;
    role: string;
    fullName: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    };
    const token = this.jwtService.sign(payload);
    return {
      token,
      expiresIn: this.parseExpirySeconds(
        this.config.get<string>('JWT_EXPIRES_IN') ?? '12h',
      ),
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  // ponytail: parse ekspresi sederhana (s/m/h/d), cukup untuk format "12h"
  private parseExpirySeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 43200;
    const amount = Number(match[1]);
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] ?? 1;
    return amount * multiplier;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Kredensial tidak valid');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('Kredensial tidak valid');
    }

    return this.signToken(user);
  }

  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesi tidak valid');
    }

    return this.signToken(user);
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    if (!user || !user.isActive) return null;
    return user;
  }
}
