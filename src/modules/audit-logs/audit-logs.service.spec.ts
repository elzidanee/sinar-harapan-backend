import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogsService } from './audit-logs.service.js';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let prisma: {
    activityLog: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      activityLog: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
  });

  describe('log', () => {
    it('mencatat log aktivitas ke database via prisma.activityLog.create', async () => {
      const mockResult = { id: 'log-1', actionType: 'CHECK_IN' };
      prisma.activityLog.create.mockResolvedValue(mockResult);

      const res = await service.log({
        userId: 'user-1',
        actionType: 'CHECK_IN',
        resourceType: 'reservation',
        resourceId: 'res-1',
        details: { roomNumber: '101' },
        ipAddress: '127.0.0.1',
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          actionType: 'CHECK_IN',
          resourceType: 'reservation',
          resourceId: 'res-1',
          details: { roomNumber: '101' },
          ipAddress: '127.0.0.1',
        },
      });
      expect(res).toBe(mockResult);
    });
  });

  describe('findAll', () => {
    it('mengembalikan daftar log aktivitas dengan pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          actionType: 'CHECK_IN',
          user: { fullName: 'Resepsionis 1', role: 'RECEPTIONIST' },
        },
      ];
      prisma.activityLog.count.mockResolvedValue(1);
      prisma.activityLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.activityLog.count).toHaveBeenCalled();
      expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.items).toEqual(mockLogs);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('memfilter berdasarkan userId, actionType, dan rentang tanggal', async () => {
      prisma.activityLog.count.mockResolvedValue(0);
      prisma.activityLog.findMany.mockResolvedValue([]);

      await service.findAll({
        userId: 'u-123',
        actionType: 'EXPORT_REPORT',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        page: 2,
        limit: 5,
      });

      expect(prisma.activityLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'u-123',
          actionType: 'EXPORT_REPORT',
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      });

      expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });
  });
});
