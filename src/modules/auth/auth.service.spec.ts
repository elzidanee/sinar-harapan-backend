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
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    activityLog: { create: ReturnType<typeof vi.fn> };
  };
  let jwtService: { sign: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
      },
      activityLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
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

    const result = await service.login(
      {
        username: 'resepsionis01',
        password: 'Resepsionis123!',
      },
      '127.0.0.1',
    );

    expect(result.token).toBe('mock-jwt-token');
    expect(result.expiresIn).toBe(43200);
    expect(result.user.fullName).toBe('Resepsionis Satu');
    expect(result.user.role).toBe('RECEPTIONIST');
    expect(jwtService.sign).toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('gagal login bila password salah dan mencatat activity log LOGIN_FAILED', async () => {
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
      service.login(
        {
          username: 'resepsionis01',
          password: 'SalahPassword!',
        },
        '192.168.1.10',
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'uuid-1',
        actionType: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        details: { username: 'resepsionis01' },
        ipAddress: '192.168.1.10',
      },
    });
  });

  it('gagal login bila user tidak aktif dan mencatat activity log LOGIN_FAILED', async () => {
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

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: undefined,
        actionType: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        details: { username: 'resepsionis01' },
        ipAddress: undefined,
      },
    });
  });

  it('gagal login bila user tidak ditemukan dan mencatat activity log LOGIN_FAILED', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        username: 'tidakada',
        password: 'Password123!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: {
        userId: undefined,
        actionType: 'LOGIN_FAILED',
        resourceType: 'AUTH',
        details: { username: 'tidakada' },
        ipAddress: undefined,
      },
    });
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
