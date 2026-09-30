import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('WhatsApp Gateway & Notifications (Tahap 6 e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;

  let roomId: string;
  let guestId: string;
  let reservationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    const passwordHash = await bcrypt.hash('WaTest123!', 10);

    // 1. Setup User Receptionist & Manager
    await prisma.user.upsert({
      where: { username: 'e2e_wa_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_wa_receptionist',
        passwordHash,
        fullName: 'E2E WA Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    await prisma.user.upsert({
      where: { username: 'e2e_wa_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_wa_manager',
        passwordHash,
        fullName: 'E2E WA Manager',
        role: 'MANAGER',
      },
    });

    // Login Receptionist
    const recLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_wa_receptionist', password: 'WaTest123!' });
    receptionistToken = recLogin.body.data.token;

    // Login Manager
    const mgrLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_wa_manager', password: 'WaTest123!' });
    managerToken = mgrLogin.body.data.token;

    // 2. Setup Room for Notification Tests
    const room = await prisma.room.upsert({
      where: { roomNumber: '808' },
      update: { status: 'OCCUPIED', basePricePerNight: 275000 },
      create: {
        roomNumber: '808',
        roomType: 'Deluxe',
        floor: 8,
        basePricePerNight: 275000,
        status: 'OCCUPIED',
      },
    });
    roomId = room.id;

    // 3. Setup Guest
    const guest = await prisma.guest.upsert({
      where: {
        idType_idNumber: {
          idType: 'KTP',
          idNumber: '3578019999990001',
        },
      },
      update: {
        fullName: 'E2E WhatsApp Guest',
        phoneWhatsapp: '081298765432',
      },
      create: {
        idType: 'KTP',
        idNumber: '3578019999990001',
        fullName: 'E2E WhatsApp Guest',
        phoneWhatsapp: '081298765432',
        address: 'Jl. Ijen No. 12, Malang',
      },
    });
    guestId = guest.id;

    // 4. Setup Active Reservation
    const now = new Date();
    const checkoutTime = new Date(now.getTime() + 45 * 60 * 1000); // 45 menit ke depan (dalam jendela H-60)

    const reservation = await prisma.reservation.create({
      data: {
        roomId,
        guestId,
        bookingSource: 'WALK_IN',
        checkInTime: now,
        expectedCheckOutTime: checkoutTime,
        totalNights: 1,
        roomRate: 275000,
        additionalCharges: 0,
        totalAmount: 275000,
        paymentMethod: 'CASH',
        invoiceNumber: 'INV/SH/20261001/8888',
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.activityLog.deleteMany({
        where: { resourceId: reservationId },
      });
      await prisma.reservation.deleteMany({
        where: { id: reservationId },
      });
      await prisma.guest.deleteMany({
        where: { id: guestId },
      });
      await prisma.room.deleteMany({
        where: { id: roomId },
      });
      await prisma.user.deleteMany({
        where: { username: { in: ['e2e_wa_receptionist', 'e2e_wa_manager'] } },
      });
    }
    await app.close();
  });

  describe('GET /api/notifications/wa-link/:reservationId', () => {
    it('harus menolak request tanpa token otentikasi (401)', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/notifications/wa-link/${reservationId}`,
      );

      expect(res.status).toBe(401);
    });

    it('harus berhasil men-generate tautan wa.me dengan template pengingat checkout', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/notifications/wa-link/${reservationId}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('waLink');
      expect(res.body.data.targetPhone).toBe('6281298765432');
      expect(res.body.data.roomNumber).toBe('808');
      expect(res.body.data.waLink).toContain('https://wa.me/6281298765432?text=');
      expect(res.body.data.waLink).toContain(encodeURIComponent('E2E WhatsApp Guest'));
    });

    it('harus berhasil men-generate wa.me link untuk BOOKING_CONFIRMATION', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/notifications/wa-link/${reservationId}?type=BOOKING_CONFIRMATION`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('INV/SH/20261001/8888');
      expect(res.body.data.message).toContain('808 (Deluxe)');
    });

    it('harus mengembalikan 404 jika reservasi tidak ditemukan', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/wa-link/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/notifications/mark-sent/:reservationId', () => {
    it('harus berhasil menandai bahwa pengingat telah dikirim oleh staf resepsionis', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/notifications/mark-sent/${reservationId}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.waDeliveryStatus).toBe('SENT');
      expect(res.body.data.waReminderSentAt).toBeDefined();

      const inDb = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(inDb?.waDeliveryStatus).toBe('SENT');
      expect(inDb?.waReminderSentAt).not.toBeNull();
    });
  });

  describe('POST /api/notifications/send-reminder', () => {
    it('harus memvalidasi body request (400 jika reservationId tidak valid / kosong)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/send-reminder')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('harus berhasil memproses pengiriman manual dalam mock mode', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/send-reminder')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reservationId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SENT');
      expect(res.body.data.mockMode).toBe(true);
      expect(res.body.data.targetPhone).toBe('6281298765432');
    });
  });

  describe('GET /api/notifications/scheduler-status', () => {
    it('harus menolak akses jika role adalah RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/scheduler-status')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(403);
    });

    it('harus mengizinkan akses untuk role MANAGER (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/scheduler-status')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isEnabled');
      expect(res.body.data).toHaveProperty('cronSchedule');
      expect(res.body.data).toHaveProperty('pendingRemindersCount');
      expect(res.body.data).toHaveProperty('history');
    });
  });

  describe('POST /api/notifications/webhook', () => {
    it('harus dapat diakses publik tanpa JWT Token dan memproses callback status', async () => {
      const payload = {
        messageId: 'fonnte-mock-999',
        status: 'delivered',
        sender: '6281298765432',
      };

      const res = await request(app.getHttpServer())
        .post('/api/notifications/webhook')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messageId).toBe('fonnte-mock-999');
      expect(res.body.data.status).toBe('DELIVERED');
    });
  });
});
