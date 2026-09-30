import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WhatsappService } from './whatsapp.service.js';

export interface SchedulerRunLog {
  timestamp: Date;
  candidatesCount: number;
  processedCount: number;
  errorCount: number;
  reservationIds: string[];
}

@Injectable()
export class CheckoutReminderScheduler {
  private readonly logger = new Logger(CheckoutReminderScheduler.name);
  private readonly runHistory: SchedulerRunLog[] = [];
  private readonly isEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsappService,
    private readonly config: ConfigService,
  ) {
    this.isEnabled =
      this.config.get<string>('CRON_CHECKOUT_REMINDER_ENABLED') !== 'false';
  }

  /**
   * Cron job berjalan tiap 10 menit untuk memantau tamu mendekati jam checkout (H-60 menit)
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCheckoutReminders() {
    if (!this.isEnabled) {
      return;
    }

    const now = new Date();
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    this.logger.debug(
      `[CRON SCHEDULER] Menjalankan pemindaian reservasi mendekati checkout (${now.toISOString()} - ${sixtyMinutesFromNow.toISOString()})`,
    );

    // Cari seluruh reservasi aktif yang belum checkout dan belum dikirim pengingat WA
    const candidates = await this.prisma.reservation.findMany({
      where: {
        actualCheckOutTime: null,
        waReminderSentAt: null,
        expectedCheckOutTime: {
          gte: now,
          lte: sixtyMinutesFromNow,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        expectedCheckOutTime: true,
      },
    });

    let processedCount = 0;
    let errorCount = 0;
    const processedIds: string[] = [];

    for (const res of candidates) {
      try {
        await this.whatsappService.sendReminder(res.id);
        processedCount += 1;
        processedIds.push(res.id);
      } catch (err) {
        errorCount += 1;
        this.logger.error(
          `Gagal memproses otomatis pengingat WA untuk reservasi ${res.invoiceNumber}:`,
          err,
        );
      }
    }

    const logEntry: SchedulerRunLog = {
      timestamp: now,
      candidatesCount: candidates.length,
      processedCount,
      errorCount,
      reservationIds: processedIds,
    };

    this.runHistory.unshift(logEntry);
    if (this.runHistory.length > 20) {
      this.runHistory.pop();
    }

    if (candidates.length > 0) {
      this.logger.log(
        `[CRON SCHEDULER] Berhasil memproses ${processedCount}/${candidates.length} pengingat check-out otomatis`,
      );
    }
  }

  /**
   * Mengembalikan status scheduler saat ini dan riwayat eksekusi
   */
  async getStatus() {
    const now = new Date();
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    const pendingCandidatesCount = await this.prisma.reservation.count({
      where: {
        actualCheckOutTime: null,
        waReminderSentAt: null,
        expectedCheckOutTime: {
          gte: now,
          lte: sixtyMinutesFromNow,
        },
      },
    });

    return {
      isEnabled: this.isEnabled,
      cronSchedule: 'Every 10 minutes (*/10 * * * *)',
      lastRun: this.runHistory[0] ?? null,
      pendingRemindersCount: pendingCandidatesCount,
      history: this.runHistory,
    };
  }
}
