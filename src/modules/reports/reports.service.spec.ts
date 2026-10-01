import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    reservation: {
      count: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    room: {
      count: ReturnType<typeof vi.fn>;
    };
  };
  let auditLogsService: {
    log: ReturnType<typeof vi.fn>;
  };

  const sampleTransaction = {
    id: 'res-uuid-1',
    invoiceNumber: 'INV/SH/20260915/0001',
    checkInTime: new Date('2026-09-15T14:00:00.000Z'),
    expectedCheckOutTime: new Date('2026-09-16T12:00:00.000Z'),
    actualCheckOutTime: new Date('2026-09-16T11:45:00.000Z'),
    totalNights: 1,
    roomRate: new Prisma.Decimal(250000),
    totalAmount: new Prisma.Decimal(250000),
    bookingSource: 'WALK_IN',
    paymentMethod: 'CASH',
    guest: {
      idType: 'KTP',
      idNumber: '3578012345670001',
      fullName: 'Budi Santoso',
      phoneWhatsapp: '081234567890',
    },
    room: {
      roomNumber: '101',
      roomType: 'Deluxe',
    },
    receptionist: {
      fullName: 'Siti Aminah',
    },
  };

  beforeEach(async () => {
    prisma = {
      reservation: {
        count: vi.fn(),
        aggregate: vi.fn(),
        findMany: vi.fn(),
      },
      room: {
        count: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('getSummary', () => {
    it('menghitung metrik performa operasional dan pendapatan dengan benar', async () => {
      // 1. checkIn count = 10, checkOut count = 8, reddoorz = 6, walkIn = 4
      prisma.reservation.count
        .mockResolvedValueOnce(10) // checkIn
        .mockResolvedValueOnce(8) // checkOut
        .mockResolvedValueOnce(6) // reddoorz
        .mockResolvedValueOnce(4); // walkIn

      // activeRooms = 20
      prisma.room.count.mockResolvedValue(20);

      // totalRoomNights sold = 15, revenue = 4500000
      prisma.reservation.aggregate
        .mockResolvedValueOnce({
          _sum: { totalNights: 15 },
        })
        .mockResolvedValueOnce({
          _sum: { totalAmount: new Prisma.Decimal(4500000) },
        });

      const summary = await service.getSummary({
        startDate: '2026-09-01',
        endDate: '2026-09-10',
      });

      expect(summary.totalCheckIn).toBe(10);
      expect(summary.totalCheckOut).toBe(8);
      expect(summary.channelComposition).toEqual({ reddoorz: 6, walkIn: 4 });
      expect(summary.totalNetRevenue).toBe(4500000);
      expect(summary.occupancyRate).toBeGreaterThan(0);
    });
  });

  describe('getTransactions', () => {
    it('mengambil transaksi terfilter dengan data relasi lengkap dan paginasi', async () => {
      prisma.reservation.count.mockResolvedValue(1);
      prisma.reservation.findMany.mockResolvedValue([sampleTransaction]);

      const result = await service.getTransactions({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        roomType: 'Deluxe',
        page: 1,
        limit: 10,
      });

      expect(prisma.reservation.count).toHaveBeenCalled();
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { checkInTime: 'desc' },
        }),
      );
      expect(result.items.length).toBe(1);
      expect(result.items[0].invoiceNumber).toBe('INV/SH/20260915/0001');
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });

  describe('exportExcel', () => {
    it('menghasilkan Buffer Excel (.xlsx) valid dan mencatat ke activity_logs', async () => {
      prisma.reservation.count.mockResolvedValue(5);
      prisma.room.count.mockResolvedValue(20);
      prisma.reservation.aggregate.mockResolvedValue({
        _sum: { totalNights: 10, totalAmount: new Prisma.Decimal(2500000) },
      });
      prisma.reservation.findMany.mockResolvedValue([sampleTransaction]);

      const buffer = await service.exportExcel(
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        'mgr-user-id',
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      // Verifikasi magic bytes ZIP/XLSX: PK.. (0x50, 0x4B)
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4b);

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mgr-user-id',
          actionType: 'EXPORT_REPORT',
          resourceType: 'report',
          details: expect.objectContaining({
            format: 'excel',
          }),
        }),
      );
    });
  });

  describe('exportPdf', () => {
    it('menghasilkan Buffer PDF valid (%PDF) dan mencatat ke activity_logs', async () => {
      prisma.reservation.count.mockResolvedValue(5);
      prisma.room.count.mockResolvedValue(20);
      prisma.reservation.aggregate.mockResolvedValue({
        _sum: { totalNights: 10, totalAmount: new Prisma.Decimal(2500000) },
      });
      prisma.reservation.findMany.mockResolvedValue([sampleTransaction]);

      const buffer = await service.exportPdf(
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        'mgr-user-id',
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      // Verifikasi header %PDF
      const headerStr = buffer.subarray(0, 4).toString('utf-8');
      expect(headerStr).toBe('%PDF');

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mgr-user-id',
          actionType: 'EXPORT_REPORT',
          resourceType: 'report',
          details: expect.objectContaining({
            format: 'pdf',
          }),
        }),
      );
    });
  });
});

// ============================================================
// security.md §10.1 — excelSanitize unit tests (standalone)
// ============================================================
import { excelSanitize } from './reports.service.js';

describe('excelSanitize (security.md §10.1 — Formula Injection Prevention)', () => {
  it.each([
    ['=SUM(A1:A10)', '='],
    ['+CMD|/C calc', '+'],
    ['-2+3+cmd', '-'],
    ['@SUM(1+1)', '@'],
    ['|ping 8.8.8.8', '|'],
    ['%0Aroot', '%'],
  ])('menyisipkan TAB sebelum string yang diawali "%s"', (input, _prefix) => {
    const result = excelSanitize(input);
    expect(result).toBe(`\t${input}`);
    expect(result.startsWith('\t')).toBe(true);
  });

  it('tidak mengubah nama tamu normal', () => {
    expect(excelSanitize('Budi Santoso')).toBe('Budi Santoso');
  });

  it('tidak mengubah nomor kamar normal', () => {
    expect(excelSanitize('101')).toBe('101');
  });

  it('mengembalikan string kosong untuk null', () => {
    expect(excelSanitize(null)).toBe('');
  });

  it('mengembalikan string kosong untuk undefined', () => {
    expect(excelSanitize(undefined)).toBe('');
  });

  it('mengembalikan string kosong untuk string kosong', () => {
    expect(excelSanitize('')).toBe('');
  });
});
