import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
  let jwtService: { sign: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
      },
    };
    jwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'JWT_EXPIRES_IN') return '12h';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('berhasil login dengan password benar', async () => {
    const passwordHash = await bcrypt.hash('Resepsionis123!', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'uuid-1',
      username: 'resepsionis01',
      passwordHash,
      fullName: 'Resepsionis Satu',
      role: 'RECEPTIONIST',
      isActive: true,
    });

    const result = await service.login({
      username: 'resepsionis01',
      password: 'Resepsionis123!',
    });

    expect(result.token).toBe('mock-jwt-token');
    expect(result.expiresIn).toBe(43200);
    expect(result.user.username ?? result.user.fullName).toBe('Resepsionis Satu');
    expect(result.user.role).toBe('RECEPTIONIST');
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('gagal login bila password salah', async () => {
    const passwordHash = await bcrypt.hash('Resepsionis123!', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'uuid-1',
      username: 'resepsionis01',
      passwordHash,
      fullName: 'Resepsionis Satu',
      role: 'RECEPTIONIST',
      isActive: true,
    });

    await expect(
      service.login({
        username: 'resepsionis01',
        password: 'SalahPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('gagal login bila user tidak aktif', async () => {
    const passwordHash = await bcrypt.hash('Resepsionis123!', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'uuid-1',
      username: 'resepsionis01',
      passwordHash,
      fullName: 'Resepsionis Satu',
      role: 'RECEPTIONIST',
      isActive: false,
    });

    await expect(
      service.login({
        username: 'resepsionis01',
        password: 'Resepsionis123!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('gagal login bila user tidak ditemukan', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        username: 'tidakada',
        password: 'Password123!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('berhasil refresh token bila user valid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'uuid-1',
      username: 'manager01',
      fullName: 'Manager Utama',
      role: 'MANAGER',
      isActive: true,
    });

    const result = await service.refresh('uuid-1');
    expect(result.token).toBe('mock-jwt-token');
    expect(result.user.role).toBe('MANAGER');
  });
});
