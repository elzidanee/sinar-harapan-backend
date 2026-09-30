import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { RoomStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { QueryRoomsDto } from './dto/query-rooms.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryRoomsDto) {
    const where: Prisma.RoomWhereInput = {};

    if (query.roomType) {
      where.roomType = query.roomType;
    }
    if (query.floor !== undefined) {
      where.floor = query.floor;
    }
    if (query.status) {
      where.status = query.status;
    }

    const take = query.limit ?? 50;
    const skip = query.page && query.page > 1 ? (query.page - 1) * take : undefined;

    return this.prisma.room.findMany({
      where,
      orderBy: { roomNumber: 'asc' },
      take: query.limit ? take : undefined,
      skip,
    });
  }

  async findStatusOnly() {
    return this.prisma.room.findMany({
      select: {
        id: true,
        roomNumber: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        reservations: {
          where: { actualCheckOutTime: null },
          take: 1,
          select: {
            id: true,
            checkInTime: true,
            expectedCheckOutTime: true,
            guest: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Kamar tidak ditemukan');
    }

    const activeRes = room.reservations[0] ?? null;
    const activeReservation = activeRes
      ? {
          id: activeRes.id,
          guestName: activeRes.guest?.fullName ?? 'Tamu',
          checkInTime: activeRes.checkInTime,
          expectedCheckOutTime: activeRes.expectedCheckOutTime,
        }
      : null;

    const { reservations: _reservations, ...roomData } = room;
    return {
      ...roomData,
      activeReservation,
    };
  }

  async create(dto: CreateRoomDto, userId?: string, ipAddress?: string) {
    const existing = await this.prisma.room.findUnique({
      where: { roomNumber: dto.roomNumber },
    });

    if (existing) {
      throw new ConflictException('Nomor kamar sudah terdaftar');
    }

    const room = await this.prisma.room.create({
      data: {
        roomNumber: dto.roomNumber,
        roomType: dto.roomType,
        floor: dto.floor,
        basePricePerNight: dto.basePricePerNight,
        facilities: dto.facilities ?? [],
        status: RoomStatus.AVAILABLE,
      },
    });

    await this.logActivity({
      userId,
      actionType: 'CREATE_ROOM',
      resourceType: 'ROOM',
      resourceId: room.id,
      details: {
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        floor: room.floor,
        basePricePerNight: Number(room.basePricePerNight),
      },
      ipAddress,
    });

    return room;
  }

  async update(id: string, dto: UpdateRoomDto, userId?: string, ipAddress?: string) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Kamar tidak ditemukan');
    }

    if (dto.roomNumber && dto.roomNumber !== existing.roomNumber) {
      const duplicate = await this.prisma.room.findUnique({
        where: { roomNumber: dto.roomNumber },
      });
      if (duplicate) {
        throw new ConflictException('Nomor kamar sudah terdaftar');
      }
    }

    if (dto.status === RoomStatus.MAINTENANCE) {
      const activeReservation = await this.prisma.reservation.findFirst({
        where: { roomId: id, actualCheckOutTime: null },
      });
      if (activeReservation) {
        throw new ConflictException(
          'Kamar memiliki reservasi aktif, tidak dapat diubah ke MAINTENANCE',
        );
      }
      if (existing.status !== RoomStatus.AVAILABLE && existing.status !== RoomStatus.MAINTENANCE) {
        throw new ConflictException(
          'Hanya kamar berstatus AVAILABLE yang dapat diubah ke MAINTENANCE',
        );
      }
    }

    if (dto.status === RoomStatus.AVAILABLE && existing.status === RoomStatus.OCCUPIED) {
      throw new ConflictException(
        'Kamar sedang ditempati tamu, tidak dapat langsung diubah ke AVAILABLE',
      );
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: {
        roomNumber: dto.roomNumber,
        roomType: dto.roomType,
        floor: dto.floor,
        basePricePerNight: dto.basePricePerNight,
        facilities: dto.facilities,
        status: dto.status,
      },
    });

    if (
      dto.basePricePerNight !== undefined &&
      Number(dto.basePricePerNight) !== Number(existing.basePricePerNight)
    ) {
      await this.logActivity({
        userId,
        actionType: 'EDIT_PRICE',
        resourceType: 'ROOM',
        resourceId: id,
        details: {
          previousPrice: Number(existing.basePricePerNight),
          newPrice: Number(dto.basePricePerNight),
        },
        ipAddress,
      });
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.logActivity({
        userId,
        actionType: 'EDIT_ROOM_STATUS',
        resourceType: 'ROOM',
        resourceId: id,
        details: {
          previousStatus: existing.status,
          newStatus: dto.status,
        },
        ipAddress,
      });
    }

    return updated;
  }

  async remove(id: string, userId?: string, ipAddress?: string) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Kamar tidak ditemukan');
    }

    const activeReservation = await this.prisma.reservation.findFirst({
      where: { roomId: id, actualCheckOutTime: null },
    });
    if (activeReservation) {
      throw new ConflictException('Kamar memiliki reservasi aktif, tidak dapat dihapus');
    }

    const pastReservation = await this.prisma.reservation.findFirst({
      where: { roomId: id },
    });
    if (pastReservation) {
      throw new ConflictException(
        'Kamar memiliki riwayat reservasi, tidak dapat dihapus demi integritas data laporan',
      );
    }

    await this.prisma.room.delete({ where: { id } });

    await this.logActivity({
      userId,
      actionType: 'DELETE_ROOM',
      resourceType: 'ROOM',
      resourceId: id,
      details: {
        roomNumber: existing.roomNumber,
      },
      ipAddress,
    });

    return { message: 'Kamar berhasil dihapus' };
  }

  async markClean(id: string, userId?: string, ipAddress?: string) {
    const existing = await this.prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Kamar tidak ditemukan');
    }

    if (existing.status === RoomStatus.AVAILABLE) {
      return existing;
    }

    if (existing.status !== RoomStatus.DIRTY) {
      throw new BadRequestException(
        'Hanya kamar dengan status DIRTY yang dapat ditandai bersih',
      );
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: { status: RoomStatus.AVAILABLE },
    });

    await this.logActivity({
      userId,
      actionType: 'EDIT_ROOM_STATUS',
      resourceType: 'ROOM',
      resourceId: id,
      details: {
        previousStatus: RoomStatus.DIRTY,
        newStatus: RoomStatus.AVAILABLE,
        reason: 'MARK_CLEAN',
      },
      ipAddress,
    });

    return updated;
  }

  private async logActivity(params: {
    userId?: string;
    actionType: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          userId: params.userId,
          actionType: params.actionType,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          details: params.details as Prisma.InputJsonValue,
          ipAddress: params.ipAddress,
        },
      });
    } catch (err) {
      console.error('[ROOMS_LOG_ACTIVITY_ERROR]', err);
    }
  }
}
