import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto.js';

export interface LogActivityParams {
  userId?: string;
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper terpusat untuk mencatat aktivitas ke tabel activity_logs
   */
  async log(params: LogActivityParams) {
    return this.prisma.activityLog.create({
      data: {
        userId: params.userId,
        actionType: params.actionType,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details as unknown as Prisma.InputJsonValue,
        ipAddress: params.ipAddress,
      },
    });
  }

  /**
   * Menampilkan daftar audit logs terfilter dan terpaginasi (khusus Manajer)
   */
  async findAll(query: QueryAuditLogsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.actionType) {
      where.actionType = query.actionType;
    }

    if (query.startDate || query.endDate) {
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) {
        const start = new Date(query.startDate);
        start.setHours(0, 0, 0, 0);
        createdAtFilter.gte = start;
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        createdAtFilter.lte = end;
      }
      where.createdAt = createdAtFilter;
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: {
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }
}
