import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { InvoiceService } from './invoice.service.js';
import { ReservationsService } from './reservations.service.js';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    reservation: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    room: {
      update: ReturnType<typeof vi.fn>;
    };
    activityLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let invoiceService: {
    generateInvoiceNumber: ReturnType<typeof vi.fn>;
    generateInvoicePdf: ReturnType<typeof vi.fn>;
  };
  let storageService: {
    uploadFile: ReturnType<typeof vi.fn>;
    createSignedUrl: ReturnType<typeof vi.fn>;
  };

  const sampleDto: CreateReservationDto = {
    roomId: 'room-uuid-1',
    bookingSource: 'WALK_IN',
    guest: {
      idType: 'KTP',
      idNumber: '3578012345670001',
      fullName: 'Budi Santoso',
      phoneWhatsapp: '081234567890',
      address: 'Jl. Merdeka No. 10, Malang',
    },
    checkInTime: '2026-09-30T14:00:00.000Z',
    expectedCheckOutTime: '2026-10-01T12:00:00.000Z',
    totalNights: 1,
    roomRate: 250000,
    paymentMethod: 'CASH',
  };

  beforeEach(async () => {
    prisma = {
      $transaction: vi.fn(),
      reservation: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      room: {
        update: vi.fn(),
      },
      activityLog: {
        create: vi.fn(),
      },
    };

    invoiceService = {
      generateInvoiceNumber: vi.fn().mockResolvedValue('INV/SH/20260930/0001'),
      generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 dummy')),
    };

    storageService = {
      uploadFile: vi.fn().mockResolvedValue('invoices/INV-SH-20260930-0001.pdf'),
      createSignedUrl: vi
        .fn()
        .mockResolvedValue('https://mock.storage.local/invoices/INV-SH-20260930-0001.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  describe('createReservation', () => {
    it('menolak booking REDDOORZ tanpa reddoorzBookingCode → 400 BadRequestException', async () => {
      const reddoorzDto: CreateReservationDto = Object.assign({}, sampleDto, {
        bookingSource: 'REDDOORZ' as const,
        reddoorzBookingCode: undefined,
      });

      await expect(
        service.createReservation(reddoorzDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak check-in jika kamar tidak berstatus AVAILABLE → 409 ConflictException', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'room-uuid-1', status: 'OCCUPIED' }]),
      };
      prisma.$transaction.mockImplementation(async (cb: (tx: any) => any) => cb(mockTx));

      await expect(
        service.createReservation(sampleDto, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('menolak check-in jika nomor identitas tamu sedang aktif di kamar lain → 409 ConflictException', async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'room-uuid-1', status: 'AVAILABLE', roomNumber: '101' },
        ]),
        reservation: {
          findFirst: vi.fn().mockResolvedValue({ id: 'active-res-id' }),
        },
      };
      prisma.$transaction.mockImplementation(async (cb: (tx: any) => any) => cb(mockTx));

      await expect(
        service.createReservation(sampleDto, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('berhasil membuat reservasi dan check-in ketika data valid dan kamar tersedia', async () => {
      const mockGuest = {
        id: 'guest-uuid-1',
        fullName: 'Budi Santoso',
        idType: 'KTP',
        idNumber: '3578012345670001',
        phoneWhatsapp: '081234567890',
      };
      const mockReservation = {
        id: 'res-uuid-1',
        invoiceNumber: 'INV/SH/20260930/0001',
        roomId: 'room-uuid-1',
        totalAmount: 250000,
        checkInTime: new Date(sampleDto.checkInTime),
        expectedCheckOutTime: new Date(sampleDto.expectedCheckOutTime),
        room: { roomNumber: '101', roomType: 'Standard' },
        guest: mockGuest,
      };

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 'room-uuid-1', status: 'AVAILABLE', room_number: '101' },
        ]),
        reservation: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockReservation),
        },
        guest: {
          upsert: vi.fn().mockResolvedValue(mockGuest),
        },
        room: {
          update: vi.fn().mockResolvedValue({ id: 'room-uuid-1', status: 'OCCUPIED' }),
        },
        activityLog: {
          create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        },
      };

      prisma.$transaction.mockImplementation(async (cb: (tx: any) => any) => cb(mockTx));

      const result = await service.createReservation(sampleDto, 'user-1', '127.0.0.1');

      expect(result.id).toBe('res-uuid-1');
      expect(result.invoiceNumber).toBe('INV/SH/20260930/0001');
      expect(result.status).toBe('OCCUPIED');
      expect(result.totalAmount).toBe(250000);
      expect(mockTx.room.update).toHaveBeenCalledWith({
        where: { id: 'room-uuid-1' },
        data: { status: 'OCCUPIED' },
      });
      expect(mockTx.activityLog.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('memaksa filter tanggal hari ini untuk role RECEPTIONIST', async () => {
      prisma.reservation.count.mockResolvedValue(1);
      prisma.reservation.findMany.mockResolvedValue([
        { id: 'res-1', invoiceNumber: 'INV/1' },
      ]);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { id: 'rec-1', role: 'RECEPTIONIST' },
      );

      expect(result.items).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(1);

      const findArgs = prisma.reservation.findMany.mock.calls[0][0];
      expect(findArgs.where.checkInTime.gte).toBeDefined();
      expect(findArgs.where.checkInTime.lte).toBeDefined();
    });

    it('mendukung custom date filter untuk role MANAGER', async () => {
      prisma.reservation.count.mockResolvedValue(5);
      prisma.reservation.findMany.mockResolvedValue([]);

      const result = await service.findAll(
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        { id: 'mgr-1', role: 'MANAGER' },
      );

      expect(result.pagination.totalItems).toBe(5);
      const findArgs = prisma.reservation.findMany.mock.calls[0][0];
      expect(findArgs.where.checkInTime.gte).toEqual(new Date('2026-09-01'));
      expect(findArgs.where.checkInTime.lte).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('mengembalikan reservasi jika ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-1',
        invoiceNumber: 'INV/1',
      });

      const result = await service.findOne('res-1');
      expect(result.id).toBe('res-1');
    });

    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('res-not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('processCheckout (Tahap 5)', () => {
    const existingReservation = {
      id: 'res-uuid-1',
      invoiceNumber: 'INV/SH/20260930/0001',
      roomId: 'room-uuid-1',
      roomRate: 250000,
      totalNights: 1,
      expectedCheckOutTime: new Date('2026-10-01T12:00:00.000Z'),
      actualCheckOutTime: null,
      room: { roomNumber: '101', roomType: 'Standard' },
      guest: {
        fullName: 'Budi Santoso',
        phoneWhatsapp: '081234567890',
        idType: 'KTP',
        idNumber: '3578012345670001',
      },
    };

    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.processCheckout('unknown-id', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('melempar ConflictException jika reservasi sudah checkout sebelumnya', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        ...existingReservation,
        actualCheckOutTime: new Date('2026-10-01T12:00:00.000Z'),
      });

      await expect(
        service.processCheckout('res-uuid-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('berhasil checkout tepat waktu tanpa late fee dan mengubah kamar jadi DIRTY', async () => {
      prisma.reservation.findUnique.mockResolvedValue(existingReservation);

      const updatedRes = {
        ...existingReservation,
        actualCheckOutTime: new Date('2026-10-01T12:00:00.000Z'),
        additionalCharges: 0,
        totalAmount: 250000,
      };

      prisma.$transaction.mockResolvedValue([updatedRes, { status: 'DIRTY' }, {}]);

      const result = await service.processCheckout(
        'res-uuid-1',
        { actualCheckOutTime: '2026-10-01T12:00:00.000Z' },
        'user-rec-1',
        '127.0.0.1',
      );

      expect(result.id).toBe('res-uuid-1');
      expect(result.additionalCharges).toBe(0);
      expect(result.totalAmount).toBe(250000);
      expect(result.invoicePdfUrl).toContain('mock.storage.local');
      expect(storageService.uploadFile).toHaveBeenCalled();
    });

    it('berhasil menghitung denda late check-out (10% tarif kamar per jam keterlambatan)', async () => {
      prisma.reservation.findUnique.mockResolvedValue(existingReservation);

      // Keterlambatan 2 jam (expected 12:00, actual 14:00)
      // Room rate: 250.000 -> 10% = 25.000/jam -> 2 jam = 50.000
      const actualCheckOutTime = '2026-10-01T14:00:00.000Z';
      const updatedRes = {
        ...existingReservation,
        actualCheckOutTime: new Date(actualCheckOutTime),
        additionalCharges: 50000,
        totalAmount: 300000,
      };

      prisma.$transaction.mockResolvedValue([updatedRes, { status: 'DIRTY' }, {}]);

      const result = await service.processCheckout('res-uuid-1', {
        actualCheckOutTime,
        additionalCharges: [{ label: 'Minibar', amount: 20000 }],
      });

      // Total additional charges: late fee 50.000 + minibar 20.000 = 70.000
      expect(result.additionalCharges).toBe(70000);
      expect(result.totalAmount).toBe(320000);
    });
  });

  describe('getInvoiceUrl (Tahap 5)', () => {
    it('mengembalikan URL invoice jika reservasi ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue({
        id: 'res-uuid-1',
        invoiceNumber: 'INV/SH/20260930/0001',
        room: { roomNumber: '101', roomType: 'Standard' },
        guest: { fullName: 'Budi Santoso' },
      });

      const res = await service.getInvoiceUrl('res-uuid-1');
      expect(res.invoicePdfUrl).toBeDefined();
    });

    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(service.getInvoiceUrl('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
