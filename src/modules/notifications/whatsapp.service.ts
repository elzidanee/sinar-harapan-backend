import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Prisma, WaDeliveryStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationType } from './dto/wa-link-query.dto.js';
import { WebhookDto } from './dto/webhook.dto.js';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider: string;
  private readonly apiToken?: string;
  private readonly apiBaseUrl: string;
  private readonly webhookSecret?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.provider = this.config.get<string>('WA_PROVIDER') ?? 'fonnte';
    this.apiToken = this.config.get<string>('WA_API_TOKEN');
    this.apiBaseUrl =
      this.config.get<string>('WA_API_BASE_URL') ?? 'https://api.fonnte.com';
    this.webhookSecret = this.config.get<string>('WA_WEBHOOK_SECRET');
  }

  /**
   * Sanitasi nomor WhatsApp ke format internasional (misal 08123... -> 628123...)
   */
  formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');

    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    if (cleaned.startsWith('0')) {
      cleaned = `62${cleaned.substring(1)}`;
    }

    return cleaned;
  }

  /**
   * Membuat template teks pesan WhatsApp resmi sesuai PRD & jenis notifikasi
   */
  buildMessageText(
    type: NotificationType,
    reservation: {
      invoiceNumber: string;
      totalAmount: Prisma.Decimal | number | string;
      checkInTime: Date;
      expectedCheckOutTime: Date;
      guest: { fullName: string; phoneWhatsapp: string };
      room: { roomNumber: string; roomType: string };
    },
    invoiceUrl?: string,
  ): string {
    const guestName = reservation.guest.fullName;
    const roomNumber = reservation.room.roomNumber;
    const roomType = reservation.room.roomType;

    const checkOutDate = new Date(reservation.expectedCheckOutTime);
    const checkOutHours = String(checkOutDate.getHours()).padStart(2, '0');
    const checkOutMinutes = String(checkOutDate.getMinutes()).padStart(2, '0');
    const checkOutTimeStr = `${checkOutHours}:${checkOutMinutes}`;

    const checkInDate = new Date(reservation.checkInTime);
    const checkInDateStr = checkInDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const checkOutDateStr = checkOutDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    switch (type) {
      case NotificationType.BOOKING_CONFIRMATION:
        return [
          `Yth. Bpk/Ibu *${guestName}*,`,
          '',
          'Terima kasih telah memilih *Hotel Sinar Harapan* (Mitra RedDoorz).',
          'Reservasi Anda telah berhasil dikonfirmasi:',
          '',
          `• *No. Invoice:* ${reservation.invoiceNumber}`,
          `• *Kamar:* ${roomNumber} (${roomType})`,
          `• *Check-in:* ${checkInDateStr}`,
          `• *Batas Check-out:* ${checkOutDateStr} (Pukul 12:00 WIB)`,
          `• *Total Bayar:* Rp ${Number(reservation.totalAmount).toLocaleString('id-ID')} (LUNAS)`,
          '',
          'Jika Anda memerlukan bantuan staf selama menginap, silakan hubungi meja resepsionis.',
          'Selamat beristirahat!',
          '',
          'Salam hangat,',
          '*Manajemen Hotel Sinar Harapan*',
        ].join('\n');

      case NotificationType.INVOICE:
        return [
          `Yth. Bpk/Ibu *${guestName}*,`,
          '',
          'Terima kasih telah menginap di *Hotel Sinar Harapan* (Mitra RedDoorz).',
          `Proses check-out untuk Kamar *${roomNumber}* telah selesai.`,
          '',
          'Faktur / Invoice resmi Anda dapat diunduh melalui tautan berikut:',
          `${invoiceUrl ?? 'Tersedia di meja resepsionis'}`,
          '',
          'Semoga perjalanan Anda menyenangkan dan kami nantikan kedatangan Anda kembali.',
          '',
          'Salam hangat,',
          '*Manajemen Hotel Sinar Harapan*',
        ].join('\n');

      case NotificationType.CHECKOUT_REMINDER:
      default:
        // Template resmi PRD FR-WA-03
        return [
          `Yth. Bpk/Ibu *${guestName}*,`,
          '',
          'Terima kasih telah menginap di Hotel Sinar Harapan (Mitra RedDoorz).',
          `Kami menginformasikan bahwa waktu check-out untuk Kamar *${roomNumber}* adalah pukul *${checkOutTimeStr} WIB* (tersisa 1 jam lagi).`,
          '',
          'Mohon pastikan seluruh barang bawaan Anda tidak tertinggal. Jika Anda memerlukan bantuan staf atau perpanjangan durasi menginap, silakan hubungi meja resepsionis.',
          '',
          'Salam hangat,',
          '*Manajemen Hotel Sinar Harapan*',
        ].join('\n');
    }
  }

  /**
   * Men-generate Click-to-Chat Deep Link WhatsApp (wa.me) langsung ke nomor tamu
   */
  async generateWaLink(
    reservationId: string,
    type: NotificationType = NotificationType.CHECKOUT_REMINDER,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        guest: true,
        room: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservasi tidak ditemukan');
    }

    const targetPhone = this.formatPhoneNumber(reservation.guest.phoneWhatsapp);

    let invoiceUrl: string | undefined;
    if (type === NotificationType.INVOICE) {
      const safeInvoiceName = reservation.invoiceNumber.replace(/[/\\]/g, '-');
      try {
        invoiceUrl = await this.storageService.createSignedUrl(
          `invoices/${safeInvoiceName}.pdf`,
          86400,
        );
      } catch {
        invoiceUrl = undefined;
      }
    }

    const message = this.buildMessageText(type, reservation, invoiceUrl);
    const encodedMessage = encodeURIComponent(message);
    const waLink = `https://wa.me/${targetPhone}?text=${encodedMessage}`;

    return {
      reservationId: reservation.id,
      guestName: reservation.guest.fullName,
      roomNumber: reservation.room.roomNumber,
      targetPhone,
      type,
      message,
      waLink,
    };
  }

  /**
   * Menandai bahwa pengingat telah dikirim oleh resepsionis atau bot
   */
  async markReminderSent(reservationId: string, status: WaDeliveryStatus = WaDeliveryStatus.SENT) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { room: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservasi tidak ditemukan');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        waReminderSentAt: new Date(),
        waDeliveryStatus: status,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        actionType: 'WA_REMINDER_SENT',
        resourceType: 'reservation',
        resourceId: reservationId,
        details: {
          roomNumber: reservation.room.roomNumber,
          invoiceNumber: reservation.invoiceNumber,
          status,
        },
      },
    });

    return {
      reservationId: updated.id,
      waReminderSentAt: updated.waReminderSentAt,
      waDeliveryStatus: updated.waDeliveryStatus,
    };
  }

  /**
   * Mengirimkan pesan pengingat via WhatsApp Gateway (Fonnte/Wablas) atau Mock Simulator
   */
  async sendReminder(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { guest: true, room: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservasi tidak ditemukan');
    }

    const targetPhone = this.formatPhoneNumber(reservation.guest.phoneWhatsapp);
    const message = this.buildMessageText(
      NotificationType.CHECKOUT_REMINDER,
      reservation,
    );

    // Jika API Token belum dikonfigurasi, gunakan mode Mock Simulator (100% Gratis)
    if (!this.apiToken || this.apiToken === 'xxxx') {
      // security.md §8: TIDAK log targetPhone/isi pesan (PII tamu) — cukup reservationId.
      this.logger.log(
        `[MOCK WA GATEWAY] Mengirim pesan pengingat untuk reservasi ${reservationId}`,
      );
      const mockMessageId = `mock-wa-${Date.now()}`;
      await this.markReminderSent(reservationId, WaDeliveryStatus.SENT);

      return {
        messageId: mockMessageId,
        status: 'SENT',
        mockMode: true,
        targetPhone,
      };
    }

    // Jika API Token tersedia (Fonnte)
    try {
      const endpoint = `${this.apiBaseUrl.replace(/\/+$/, '')}/send`;
      const response = await firstValueFrom(
        this.httpService.post<{ id?: string; status?: boolean; message?: string }>(
          endpoint,
          {
            target: targetPhone,
            message,
          },
          {
            headers: {
              Authorization: this.apiToken,
            },
          },
        ),
      );

      const messageId = response.data.id ?? `fonnte-${Date.now()}`;
      await this.markReminderSent(reservationId, WaDeliveryStatus.SENT);

      return {
        messageId,
        status: 'SENT',
        mockMode: false,
        targetPhone,
      };
    } catch (error) {
      // security.md §8: TIDAK log targetPhone (PII) — cukup reservationId.
      this.logger.error(
        `Gagal mengirim WhatsApp untuk reservasi ${reservationId} via gateway:`,
        error,
      );
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { waDeliveryStatus: WaDeliveryStatus.FAILED },
      });
      // business-flow.md §5: kegagalan pengiriman tercatat sebagai WA_REMINDER_FAILED
      try {
        await this.prisma.activityLog.create({
          data: {
            actionType: 'WA_REMINDER_FAILED',
            resourceType: 'reservation',
            resourceId: reservationId,
            details: {
              invoiceNumber: reservation.invoiceNumber,
              roomNumber: reservation.room.roomNumber,
              reason: error instanceof Error ? error.message : 'gateway_error',
            },
          },
        });
      } catch (logError) {
        this.logger.error(
          `[WA_REMINDER_FAILED_LOG_ERROR] reservasi ${reservationId}:`,
          logError,
        );
      }
      throw error;
    }
  }

  /**
   * Memproses callback webhook status pesan dari provider
   */
  async handleWebhook(payload: WebhookDto) {
    const statusMap: Record<string, WaDeliveryStatus> = {
      sent: WaDeliveryStatus.SENT,
      delivered: WaDeliveryStatus.DELIVERED,
      read: WaDeliveryStatus.READ,
      failed: WaDeliveryStatus.FAILED,
    };

    const targetStatus =
      statusMap[payload.status?.toLowerCase()] ?? WaDeliveryStatus.SENT;

    const msgId = payload.messageId ?? payload.id ?? 'unknown';

    // security.md §8: TIDAK log konten pesan/muatan webhook (potensi PII tamu).
    this.logger.log(`Webhook WhatsApp diterima: Status: ${targetStatus}`);

    return {
      success: true,
      messageId: msgId,
      status: targetStatus,
    };
  }

  /**
   * Verifikasi signature HMAC webhook dari provider untuk mencegah spoofing.
   * security.md §11.2: fail-closed — tanpa secret yang valid, semua webhook ditolak.
   * Format header: "sha256=<hex>" (prefix opsional, hex dibanding sebagai bytes).
   */
  verifyWebhookSignature(rawBody?: Buffer, signature?: string): boolean {
    if (!this.webhookSecret || this.webhookSecret === 'xxxx') {
      return false;
    }

    if (!rawBody || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    let sigHex = signature.trim();
    if (sigHex.startsWith('sha256=')) {
      sigHex = sigHex.slice('sha256='.length);
    }

    let sigBuffer: Buffer;
    let expectedBuffer: Buffer;
    try {
      sigBuffer = Buffer.from(sigHex, 'hex');
      expectedBuffer = Buffer.from(expectedSignature, 'hex');
    } catch {
      return false;
    }

    if (sigBuffer.length !== expectedBuffer.length || sigBuffer.length === 0) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }
}
