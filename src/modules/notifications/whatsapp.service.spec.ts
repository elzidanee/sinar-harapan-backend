import { HttpService } from '@nestjs/axios';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaDeliveryStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationType } from './dto/wa-link-query.dto.js';
import { WhatsappService } from './whatsapp.service.js';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: {
    reservation: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    activityLog: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let httpService: {
    post: ReturnType<typeof vi.fn>;
  };
  let configService: {
    get: ReturnType<typeof vi.fn>;
  };
  let storageService: {
    createSignedUrl: ReturnType<typeof vi.fn>;
  };

  const sampleReservation = {
    id: 'res-uuid-1',
    invoiceNumber: 'INV/SH/20261001/0001',
    totalAmount: 300000,
    checkInTime: new Date('2026-10-01T14:00:00.000Z'),
    expectedCheckOutTime: new Date('2026-10-02T12:00:00.000Z'),
    waReminderSentAt: null,
    waDeliveryStatus: null,
    guest: {
      fullName: 'Ahmad Dahlan',
      phoneWhatsapp: '081234567890',
    },
    room: {
      roomNumber: '101',
      roomType: 'DELUXE',
    },
  };

  beforeEach(async () => {
    prisma = {
      reservation: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      activityLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    httpService = {
      post: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'WA_PROVIDER') return 'fonnte';
        if (key === 'WA_API_TOKEN') return undefined; // default mock mode
        if (key === 'WA_API_BASE_URL') return 'https://api.fonnte.com';
        if (key === 'WA_WEBHOOK_SECRET') return 'test-secret';
        return undefined;
      }),
    };

    storageService = {
      createSignedUrl: vi.fn().mockResolvedValue('https://supabase.co/signed-url/invoice.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: PrismaService, useValue: prisma },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  describe('formatPhoneNumber', () => {
    it('mengubah awalan 0 menjadi 62 untuk nomor lokal Indonesia', () => {
      expect(service.formatPhoneNumber('081234567890')).toBe('6281234567890');
    });

    it('menghapus tanda plus (+) jika sudah ada 62', () => {
      expect(service.formatPhoneNumber('+6281234567890')).toBe('6281234567890');
    });

    it('menghapus spasi dan tanda minus', () => {
      expect(service.formatPhoneNumber('0812-3456-7890')).toBe('6281234567890');
      expect(service.formatPhoneNumber('+62 812 3456 7890')).toBe('6281234567890');
    });

    it('mengembalikan string kosong jika input kosong', () => {
      expect(service.formatPhoneNumber('')).toBe('');
    });
  });

  describe('buildMessageText', () => {
    it('membuat teks pesan untuk CHECKOUT_REMINDER', () => {
      const msg = service.buildMessageText(
        NotificationType.CHECKOUT_REMINDER,
        sampleReservation,
      );

      expect(msg).toContain('Ahmad Dahlan');
      expect(msg).toContain('101');
      expect(msg).toContain('Hotel Sinar Harapan');
      expect(msg).toContain('tersisa 1 jam lagi');
    });

    it('membuat teks pesan untuk BOOKING_CONFIRMATION', () => {
      const msg = service.buildMessageText(
        NotificationType.BOOKING_CONFIRMATION,
        sampleReservation,
      );

      expect(msg).toContain('INV/SH/20261001/0001');
      expect(msg).toContain('101 (DELUXE)');
      expect(msg).toContain('Rp 300.000 (LUNAS)');
    });

    it('membuat teks pesan untuk INVOICE dengan link unduhan', () => {
      const invoiceUrl = 'https://storage.example.com/invoice.pdf';
      const msg = service.buildMessageText(
        NotificationType.INVOICE,
        sampleReservation,
        invoiceUrl,
      );

      expect(msg).toContain('Faktur / Invoice resmi Anda');
      expect(msg).toContain(invoiceUrl);
    });
  });

  describe('generateWaLink', () => {
    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.generateWaLink('res-non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('menghasilkan URL wa.me yang valid dan URL-encoded', async () => {
      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);

      const result = await service.generateWaLink(
        sampleReservation.id,
        NotificationType.CHECKOUT_REMINDER,
      );

      expect(result.reservationId).toBe(sampleReservation.id);
      expect(result.guestName).toBe('Ahmad Dahlan');
      expect(result.roomNumber).toBe('101');
      expect(result.targetPhone).toBe('6281234567890');
      expect(result.waLink).toContain('https://wa.me/6281234567890?text=');
      expect(result.waLink).toContain(encodeURIComponent('Ahmad Dahlan'));
    });

    it('menyertakan link unduhan invoice jika type adalah INVOICE', async () => {
      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);

      const result = await service.generateWaLink(
        sampleReservation.id,
        NotificationType.INVOICE,
      );

      expect(storageService.createSignedUrl).toHaveBeenCalledWith(
        'invoices/INV-SH-20261001-0001.pdf',
        86400,
      );
      expect(result.message).toContain('https://supabase.co/signed-url/invoice.pdf');
    });
  });

  describe('markReminderSent', () => {
    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.markReminderSent('res-not-found'),
      ).rejects.toThrow(NotFoundException);
    });

    it('memperbarui waReminderSentAt dan waDeliveryStatus serta mencatat activity log', async () => {
      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);
      const fakeDate = new Date();
      prisma.reservation.update.mockResolvedValue({
        ...sampleReservation,
        waReminderSentAt: fakeDate,
        waDeliveryStatus: WaDeliveryStatus.SENT,
      });

      const result = await service.markReminderSent(
        sampleReservation.id,
        WaDeliveryStatus.SENT,
      );

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: sampleReservation.id },
        data: {
          waReminderSentAt: expect.any(Date),
          waDeliveryStatus: WaDeliveryStatus.SENT,
        },
      });

      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionType: 'WA_REMINDER_SENT',
          resourceType: 'reservation',
          resourceId: sampleReservation.id,
        }),
      });

      expect(result.reservationId).toBe(sampleReservation.id);
      expect(result.waDeliveryStatus).toBe(WaDeliveryStatus.SENT);
    });
  });

  describe('sendReminder', () => {
    it('melempar NotFoundException jika reservasi tidak ditemukan', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.sendReminder('res-not-found'),
      ).rejects.toThrow(NotFoundException);
    });

    it('berjalan dalam Mock Simulator mode (100% Gratis) jika API token tidak disetel', async () => {
      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);
      prisma.reservation.update.mockResolvedValue({
        ...sampleReservation,
        waReminderSentAt: new Date(),
        waDeliveryStatus: WaDeliveryStatus.SENT,
      });

      const result = await service.sendReminder(sampleReservation.id);

      expect(result.mockMode).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.targetPhone).toBe('6281234567890');
      expect(result.messageId).toContain('mock-wa-');
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('mengirim HTTP POST ke API Fonnte jika WA_API_TOKEN dikonfigurasi', async () => {
      // Re-create service with WA_API_TOKEN set
      const customConfig = {
        get: vi.fn((key: string) => {
          if (key === 'WA_PROVIDER') return 'fonnte';
          if (key === 'WA_API_TOKEN') return 'valid-fonnte-token';
          if (key === 'WA_API_BASE_URL') return 'https://api.fonnte.com';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsappService,
          { provide: PrismaService, useValue: prisma },
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: customConfig },
          { provide: StorageService, useValue: storageService },
        ],
      }).compile();

      const gatewayService = module.get<WhatsappService>(WhatsappService);

      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);
      prisma.reservation.update.mockResolvedValue({
        ...sampleReservation,
        waReminderSentAt: new Date(),
        waDeliveryStatus: WaDeliveryStatus.SENT,
      });

      httpService.post.mockReturnValue(
        of({
          data: { id: 'fonnte-msg-12345', status: true },
        }),
      );

      const result = await gatewayService.sendReminder(sampleReservation.id);

      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.fonnte.com/send',
        expect.objectContaining({
          target: '6281234567890',
          message: expect.stringContaining('Ahmad Dahlan'),
        }),
        expect.objectContaining({
          headers: {
            Authorization: 'valid-fonnte-token',
          },
        }),
      );

      expect(result.mockMode).toBe(false);
      expect(result.messageId).toBe('fonnte-msg-12345');
    });

    it('menandai status FAILED di database jika HTTP request gateway gagal', async () => {
      const customConfig = {
        get: vi.fn((key: string) => {
          if (key === 'WA_API_TOKEN') return 'valid-fonnte-token';
          if (key === 'WA_API_BASE_URL') return 'https://api.fonnte.com';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsappService,
          { provide: PrismaService, useValue: prisma },
          { provide: HttpService, useValue: httpService },
          { provide: ConfigService, useValue: customConfig },
          { provide: StorageService, useValue: storageService },
        ],
      }).compile();

      const gatewayService = module.get<WhatsappService>(WhatsappService);

      prisma.reservation.findUnique.mockResolvedValue(sampleReservation);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection timeout')),
      );

      await expect(gatewayService.sendReminder(sampleReservation.id)).rejects.toThrow(
        'Connection timeout',
      );

      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: sampleReservation.id },
        data: { waDeliveryStatus: WaDeliveryStatus.FAILED },
      });
    });
  });

  describe('handleWebhook', () => {
    it('memetakan status webhook dengan benar', async () => {
      const result = await service.handleWebhook({
        messageId: 'msg-abc',
        status: 'delivered',
        sender: '6281234567890',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(WaDeliveryStatus.DELIVERED);
    });

    it('fallback ke SENT jika status webhook tidak dikenal', async () => {
      const result = await service.handleWebhook({
        messageId: 'msg-abc',
        status: 'unknown_status',
      });

      expect(result.status).toBe(WaDeliveryStatus.SENT);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('mengembalikan true jika webhook secret belum disetel (mode dev)', () => {
      const devConfig = {
        get: vi.fn(() => undefined),
      };
      const devService = new WhatsappService(
        prisma as any,
        httpService as any,
        devConfig as any,
        storageService as any,
      );

      expect(devService.verifyWebhookSignature(Buffer.from('body'), 'any')).toBe(true);
    });

    it('mengembalikan true jika signature HMAC cocok', () => {
      const rawBody = Buffer.from('{"status":"read"}');
      const secret = 'test-secret';
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      expect(service.verifyWebhookSignature(rawBody, expectedSig)).toBe(true);
    });

    it('mengembalikan false jika signature salah', () => {
      const rawBody = Buffer.from('{"status":"read"}');
      expect(service.verifyWebhookSignature(rawBody, 'invalid-signature')).toBe(false);
    });
  });
});
