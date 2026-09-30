import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { QueryReservationsDto } from './dto/query-reservations.dto.js';
import { InvoiceService } from './invoice.service.js';

interface RawRoomRow {
  id: string;
  status: string;
  room_number?: string;
  roomNumber?: string;
  room_type?: string;
  roomType?: string;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async createReservation(
    dto: CreateReservationDto,
    receptionistUserId?: string,
    ip?: string,
  ) {
    if (dto.bookingSource === 'REDDOORZ' && (!dto.reddoorzBookingCode || dto.reddoorzBookingCode.trim() === '')) {
      throw new BadRequestException('reddoorzBookingCode wajib diisi untuk booking REDDOORZ');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Row-level lock pada kamar untuk mencegah race condition (double booking)
      const rooms = await tx.$queryRaw<RawRoomRow[]>`
        SELECT * FROM rooms WHERE id = ${dto.roomId} FOR UPDATE
      `;
      const room = rooms?.[0];

      if (!room || room.status !== 'AVAILABLE') {
        throw new ConflictException('Kamar sudah tidak tersedia');
      }

      // 2. Cek apakah nomor identitas tamu sedang aktif check-in di kamar lain
      const activeReservation = await tx.reservation.findFirst({
        where: {
          guest: {
            idType: dto.guest.idType,
            idNumber: dto.guest.idNumber,
          },
          actualCheckOutTime: null,
        },
      });

      if (activeReservation) {
        throw new ConflictException(
          `Nomor ${dto.guest.idType} ini sedang aktif check-in di kamar lain`,
        );
      }

      // 3. Upsert data tamu
      const guest = await tx.guest.upsert({
        where: {
          idType_idNumber: {
            idType: dto.guest.idType,
            idNumber: dto.guest.idNumber,
          },
        },
        update: {
          fullName: dto.guest.fullName,
          phoneWhatsapp: dto.guest.phoneWhatsapp,
          nationality: dto.guest.nationality ?? undefined,
          address: dto.guest.address ?? undefined,
          idImageUrl: dto.guest.idImageUrl ?? undefined,
        },
        create: {
          idType: dto.guest.idType,
          idNumber: dto.guest.idNumber,
          fullName: dto.guest.fullName,
          address: dto.guest.address,
          nationality: dto.guest.nationality,
          phoneWhatsapp: dto.guest.phoneWhatsapp,
          idImageUrl: dto.guest.idImageUrl,
        },
      });

      // 4. Generate nomor invoice unik
      const invoiceNumber = await this.invoiceService.generateInvoiceNumber(tx);

      // 5. Hitung total biaya menginap
      const totalAmount = new Prisma.Decimal(dto.totalNights).mul(
        new Prisma.Decimal(dto.roomRate),
      );

      // 6. Buat data reservasi baru
      const reservation = await tx.reservation.create({
        data: {
          invoiceNumber,
          guestId: guest.id,
          roomId: dto.roomId,
          bookingSource: dto.bookingSource,
          reddoorzBookingCode: dto.reddoorzBookingCode ?? null,
          checkInTime: new Date(dto.checkInTime),
          expectedCheckOutTime: new Date(dto.expectedCheckOutTime),
          totalNights: dto.totalNights,
          roomRate: new Prisma.Decimal(dto.roomRate),
          totalAmount,
          paymentMethod: dto.paymentMethod,
          paymentStatus: 'PAID',
          receptionistUserId: receptionistUserId || null,
        },
        include: {
          room: true,
          guest: true,
        },
      });

      // 7. Update status kamar menjadi OCCUPIED
      await tx.room.update({
        where: { id: dto.roomId },
        data: { status: 'OCCUPIED' },
      });

      // 8. Catat ke tabel riwayat aktivitas (activity_logs)
      const roomNumber = room.room_number ?? room.roomNumber ?? reservation.room?.roomNumber;
      await tx.activityLog.create({
        data: {
          userId: receptionistUserId || null,
          actionType: 'CHECK_IN',
          resourceType: 'reservation',
          resourceId: reservation.id,
          details: {
            roomNumber,
            invoiceNumber,
            guestName: guest.fullName,
            idNumber: guest.idNumber,
          },
          ipAddress: ip || null,
        },
      });

      return {
        id: reservation.id,
        invoiceNumber: reservation.invoiceNumber,
        roomId: reservation.roomId,
        totalAmount: Number(reservation.totalAmount),
        status: 'OCCUPIED',
        checkInTime: reservation.checkInTime,
        expectedCheckOutTime: reservation.expectedCheckOutTime,
        guest: {
          id: guest.id,
          fullName: guest.fullName,
          idType: guest.idType,
          idNumber: guest.idNumber,
          phoneWhatsapp: guest.phoneWhatsapp,
        },
        room: {
          id: reservation.roomId,
          roomNumber,
          roomType: reservation.room?.roomType,
        },
      };
    });
  }

  async findAll(query: QueryReservationsDto, user: { id: string; role: string }) {
    const where: Prisma.ReservationWhereInput = {};

    // RBAC: Resepsionis dipaksa hanya melihat reservasi hari ini
    if (user.role === 'RECEPTIONIST') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      where.checkInTime = {
        gte: startOfToday,
        lte: endOfToday,
      };
    } else {
      // Manager dapat memfilter rentang tanggal
      if (query.startDate || query.endDate) {
        where.checkInTime = {};
        if (query.startDate) {
          where.checkInTime.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          const endDate = new Date(query.endDate);
          if (query.endDate.length <= 10) {
            endDate.setHours(23, 59, 59, 999);
          }
          where.checkInTime.lte = endDate;
        }
      }
    }

    if (query.status === 'ACTIVE') {
      where.actualCheckOutTime = null;
    } else if (query.status === 'COMPLETED') {
      where.actualCheckOutTime = { not: null };
    }

    if (query.roomType) {
      where.room = {
        roomType: {
          equals: query.roomType,
          mode: 'insensitive',
        },
      };
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const [totalItems, reservations] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: {
          room: {
            select: {
              id: true,
              roomNumber: true,
              roomType: true,
              floor: true,
            },
          },
          guest: {
            select: {
              id: true,
              fullName: true,
              idType: true,
              idNumber: true,
              phoneWhatsapp: true,
              nationality: true,
            },
          },
        },
        orderBy: {
          checkInTime: 'desc',
        },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: reservations,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
            roomType: true,
            floor: true,
            basePricePerNight: true,
          },
        },
        guest: {
          select: {
            id: true,
            fullName: true,
            idType: true,
            idNumber: true,
            phoneWhatsapp: true,
            address: true,
            nationality: true,
            idImageUrl: true,
          },
        },
        receptionist: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservasi tidak ditemukan');
    }

    return reservation;
  }
}
