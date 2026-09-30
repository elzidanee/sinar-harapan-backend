import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CheckoutReminderScheduler } from './checkout-reminder.scheduler.js';
import { WhatsappService } from './whatsapp.service.js';

describe('CheckoutReminderScheduler', () => {
  let scheduler: CheckoutReminderScheduler;
  let prisma: {
    reservation: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };
  let whatsappService: {
    sendReminder: ReturnType<typeof vi.fn>;
  };
  let configService: {
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      reservation: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    whatsappService = {
      sendReminder: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'CRON_CHECKOUT_REMINDER_ENABLED') return 'true';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutReminderScheduler,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    scheduler = module.get<CheckoutReminderScheduler>(CheckoutReminderScheduler);
  });

  describe('handleCheckoutReminders', () => {
    it('tidak melakukan apa-apa jika scheduler dinonaktifkan via config', async () => {
      const disabledConfig = {
        get: vi.fn(() => 'false'),
      };
      const disabledScheduler = new CheckoutReminderScheduler(
        prisma as any,
        whatsappService as any,
        disabledConfig as any,
      );

      await disabledScheduler.handleCheckoutReminders();

      expect(prisma.reservation.findMany).not.toHaveBeenCalled();
    });

    it('mencari kandidat reservasi aktif mendekati checkout dan memanggil sendReminder', async () => {
      const mockCandidates = [
        { id: 'res-1', invoiceNumber: 'INV/1', expectedCheckOutTime: new Date() },
        { id: 'res-2', invoiceNumber: 'INV/2', expectedCheckOutTime: new Date() },
      ];

      prisma.reservation.findMany.mockResolvedValue(mockCandidates);
      whatsappService.sendReminder.mockResolvedValue({ status: 'SENT' });

      await scheduler.handleCheckoutReminders();

      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actualCheckOutTime: null,
            waReminderSentAt: null,
          }),
        }),
      );

      expect(whatsappService.sendReminder).toHaveBeenCalledTimes(2);
      expect(whatsappService.sendReminder).toHaveBeenCalledWith('res-1');
      expect(whatsappService.sendReminder).toHaveBeenCalledWith('res-2');

      const status = await scheduler.getStatus();
      expect(status.history.length).toBe(1);
      expect(status.history[0].candidatesCount).toBe(2);
      expect(status.history[0].processedCount).toBe(2);
      expect(status.history[0].errorCount).toBe(0);
    });

    it('tetap melanjutkan proses ke reservasi berikutnya jika salah satu reservasi gagal terkirim', async () => {
      const mockCandidates = [
        { id: 'res-fail', invoiceNumber: 'INV/FAIL', expectedCheckOutTime: new Date() },
        { id: 'res-success', invoiceNumber: 'INV/SUCCESS', expectedCheckOutTime: new Date() },
      ];

      prisma.reservation.findMany.mockResolvedValue(mockCandidates);
      whatsappService.sendReminder
        .mockRejectedValueOnce(new Error('Gateway down'))
        .mockResolvedValueOnce({ status: 'SENT' });

      await scheduler.handleCheckoutReminders();

      expect(whatsappService.sendReminder).toHaveBeenCalledTimes(2);

      const status = await scheduler.getStatus();
      expect(status.history[0].candidatesCount).toBe(2);
      expect(status.history[0].processedCount).toBe(1);
      expect(status.history[0].errorCount).toBe(1);
      expect(status.history[0].reservationIds).toEqual(['res-success']);
    });
  });

  describe('getStatus', () => {
    it('mengembalikan status ringkasan scheduler dan jumlah reservasi yang pending', async () => {
      prisma.reservation.count.mockResolvedValue(3);

      const status = await scheduler.getStatus();

      expect(status.isEnabled).toBe(true);
      expect(status.cronSchedule).toContain('Every 10 minutes');
      expect(status.pendingRemindersCount).toBe(3);
      expect(Array.isArray(status.history)).toBe(true);
    });
  });
});
