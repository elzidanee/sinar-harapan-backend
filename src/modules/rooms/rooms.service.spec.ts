import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RoomsService } from './rooms.service.js';

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: {
    room: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    reservation: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    activityLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      room: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      reservation: {
        findFirst: vi.fn(),
      },
      activityLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('findAll', () => {
    it('mengembalikan daftar kamar sesuai filter', async () => {
      const mockRooms = [
        { id: 'r1', roomNumber: '101', roomType: 'Standard', floor: 1, status: RoomStatus.AVAILABLE },
      ];
      prisma.room.findMany.mockResolvedValue(mockRooms);

      const result = await service.findAll({ roomType: 'Standard', floor: 1, status: RoomStatus.AVAILABLE });
      expect(result).toEqual(mockRooms);
      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomType: 'Standard', floor: 1, status: RoomStatus.AVAILABLE },
          orderBy: { roomNumber: 'asc' },
        }),
      );
    });
  });

  describe('findStatusOnly', () => {
    it('mengembalikan payload minimal untuk status grid', async () => {
      const mockStatus = [{ id: 'r1', roomNumber: '101', status: RoomStatus.OCCUPIED, updatedAt: new Date() }];
      prisma.room.findMany.mockResolvedValue(mockStatus);

      const result = await service.findStatusOnly();
      expect(result).toEqual(mockStatus);
      expect(prisma.room.findMany).toHaveBeenCalledWith({
        select: { id: true, roomNumber: true, status: true, updatedAt: true },
        orderBy: { roomNumber: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('mengembalikan detail kamar beserta activeReservation bila ada', async () => {
      const checkInTime = new Date();
      const expectedCheckOutTime = new Date();
      prisma.room.findUnique.mockResolvedValue({
        id: 'r1',
        roomNumber: '101',
        status: RoomStatus.OCCUPIED,
        reservations: [
          {
            id: 'res-1',
            checkInTime,
            expectedCheckOutTime,
            guest: { fullName: 'Budi Santoso' },
          },
        ],
      });

      const result = await service.findOne('r1');
      expect(result.id).toBe('r1');
      expect(result.activeReservation).toEqual({
        id: 'res-1',
        guestName: 'Budi Santoso',
        checkInTime,
        expectedCheckOutTime,
      });
    });

    it('mengembalikan activeReservation: null bila tidak ada reservasi aktif', async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: 'r1',
        roomNumber: '101',
        status: RoomStatus.AVAILABLE,
        reservations: [],
      });

      const result = await service.findOne('r1');
      expect(result.activeReservation).toBeNull();
    });

    it('melempar NotFoundException bila kamar tidak ditemukan', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.findOne('tidak-ada')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('berhasil membuat kamar baru dan mencatat activity log', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      const createdRoom = {
        id: 'r-new',
        roomNumber: '201',
        roomType: 'Deluxe',
        floor: 2,
        basePricePerNight: 450000,
        facilities: ['AC', 'TV'],
        status: RoomStatus.AVAILABLE,
      };
      prisma.room.create.mockResolvedValue(createdRoom);

      const result = await service.create(
        {
          roomNumber: '201',
          roomType: 'Deluxe',
          floor: 2,
          basePricePerNight: 450000,
          facilities: ['AC', 'TV'],
        },
        'user-manager-id',
        '127.0.0.1',
      );

      expect(result).toEqual(createdRoom);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'CREATE_ROOM',
          resourceType: 'ROOM',
          resourceId: 'r-new',
          userId: 'user-manager-id',
          ipAddress: '127.0.0.1',
        }),
      });
    });

    it('melempar ConflictException jika nomor kamar sudah ada', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', roomNumber: '101' });

      await expect(
        service.create({
          roomNumber: '101',
          roomType: 'Standard',
          floor: 1,
          basePricePerNight: 250000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('melempar NotFoundException jika kamar tidak ditemukan', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.update('r-unknown', { basePricePerNight: 300000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('melempar ConflictException jika nomor kamar baru sudah dipakai kamar lain', async () => {
      prisma.room.findUnique
        .mockResolvedValueOnce({ id: 'r1', roomNumber: '101' })
        .mockResolvedValueOnce({ id: 'r2', roomNumber: '102' });

      await expect(service.update('r1', { roomNumber: '102' })).rejects.toThrow(ConflictException);
    });

    it('melempar ConflictException jika mengubah status ke MAINTENANCE padahal ada reservasi aktif', async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: 'r1',
        roomNumber: '101',
        status: RoomStatus.AVAILABLE,
      });
      prisma.reservation.findFirst.mockResolvedValue({ id: 'active-res' });

      await expect(service.update('r1', { status: RoomStatus.MAINTENANCE })).rejects.toThrow(
        ConflictException,
      );
    });

    it('melempar ConflictException jika mengubah kamar OCCUPIED ke MAINTENANCE', async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: 'r1',
        roomNumber: '101',
        status: RoomStatus.OCCUPIED,
      });
      prisma.reservation.findFirst.mockResolvedValue(null);

      await expect(service.update('r1', { status: RoomStatus.MAINTENANCE })).rejects.toThrow(
        ConflictException,
      );
    });

    it('berhasil update harga dan status serta mencatat activity log', async () => {
      const existing = {
        id: 'r1',
        roomNumber: '101',
        basePricePerNight: 250000,
        status: RoomStatus.AVAILABLE,
      };
      prisma.room.findUnique.mockResolvedValue(existing);
      prisma.reservation.findFirst.mockResolvedValue(null);
      prisma.room.update.mockResolvedValue({
        ...existing,
        basePricePerNight: 300000,
        status: RoomStatus.MAINTENANCE,
      });

      const updated = await service.update(
        'r1',
        { basePricePerNight: 300000, status: RoomStatus.MAINTENANCE },
        'mgr-1',
        '10.0.0.1',
      );

      expect(updated.basePricePerNight).toBe(300000);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'EDIT_PRICE',
          resourceType: 'ROOM',
          resourceId: 'r1',
        }),
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'EDIT_ROOM_STATUS',
          resourceType: 'ROOM',
          resourceId: 'r1',
        }),
      });
    });
  });

  describe('remove', () => {
    it('melempar ConflictException jika kamar memiliki reservasi aktif', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', roomNumber: '101' });
      prisma.reservation.findFirst.mockResolvedValue({ id: 'res-active' });

      await expect(service.remove('r1')).rejects.toThrow(ConflictException);
    });

    it('melempar ConflictException jika kamar memiliki riwayat reservasi', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', roomNumber: '101' });
      prisma.reservation.findFirst
        .mockResolvedValueOnce(null) // no active reservation
        .mockResolvedValueOnce({ id: 'res-past' }); // has past reservation

      await expect(service.remove('r1')).rejects.toThrow(ConflictException);
    });

    it('berhasil menghapus kamar jika tidak ada riwayat reservasi dan mencatat activity log', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', roomNumber: '101' });
      prisma.reservation.findFirst.mockResolvedValue(null);
      prisma.room.delete.mockResolvedValue({ id: 'r1' });

      const res = await service.remove('r1', 'mgr-1', '127.0.0.1');
      expect(res.message).toBe('Kamar berhasil dihapus');
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'DELETE_ROOM',
          resourceId: 'r1',
        }),
      });
    });
  });

  describe('markClean', () => {
    it('melempar NotFoundException jika kamar tidak ada', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(service.markClean('unknown-id')).rejects.toThrow(NotFoundException);
    });

    it('melempar BadRequestException jika status kamar bukan DIRTY', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', status: RoomStatus.OCCUPIED });
      await expect(service.markClean('r1')).rejects.toThrow(BadRequestException);
    });

    it('berhasil mengubah status dari DIRTY menjadi AVAILABLE dan mencatat log', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'r1', status: RoomStatus.DIRTY });
      prisma.room.update.mockResolvedValue({ id: 'r1', status: RoomStatus.AVAILABLE });

      const res = await service.markClean('r1', 'rec-1', '127.0.0.1');
      expect(res.status).toBe(RoomStatus.AVAILABLE);
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'EDIT_ROOM_STATUS',
          details: expect.objectContaining({ reason: 'MARK_CLEAN' }),
        }),
      });
    });

    it('mengembalikan kamar langsung jika sudah AVAILABLE', async () => {
      const room = { id: 'r1', status: RoomStatus.AVAILABLE };
      prisma.room.findUnique.mockResolvedValue(room);

      const res = await service.markClean('r1');
      expect(res).toEqual(room);
      expect(prisma.room.update).not.toHaveBeenCalled();
    });
  });
});
