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

describe('Reporting & Audit Logs (Tahap 7 e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;

  let roomId1: string;
  let roomId2: string;
  let guestId: string;
  let reservationId1: string;
  let reservationId2: string;

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
    const passwordHash = await bcrypt.hash('ReportPass123!', 10);

    // 1. Setup User Receptionist & Manager
    const recUser = await prisma.user.upsert({
      where: { username: 'e2e_rep_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_rep_receptionist',
        passwordHash,
        fullName: 'E2E Rep Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    await prisma.user.upsert({
      where: { username: 'e2e_rep_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_rep_manager',
        passwordHash,
        fullName: 'E2E Rep Manager',
        role: 'MANAGER',
      },
    });

    // Login Receptionist
    const recLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_rep_receptionist', password: 'ReportPass123!' });
    receptionistToken = recLogin.body.data.token;

    // Login Manager
    const mgrLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_rep_manager', password: 'ReportPass123!' });
    managerToken = mgrLogin.body.data.token;

    // 2. Setup Rooms
    const r1 = await prisma.room.upsert({
      where: { roomNumber: '901' },
      update: { status: 'AVAILABLE', basePricePerNight: 200000 },
      create: {
        roomNumber: '901',
        roomType: 'Standard',
        floor: 9,
        basePricePerNight: 200000,
        status: 'AVAILABLE',
      },
    });
    roomId1 = r1.id;

    const r2 = await prisma.room.upsert({
      where: { roomNumber: '902' },
      update: { status: 'OCCUPIED', basePricePerNight: 350000 },
      create: {
        roomNumber: '902',
        roomType: 'Suite',
        floor: 9,
        basePricePerNight: 350000,
        status: 'OCCUPIED',
      },
    });
    roomId2 = r2.id;

    // 3. Setup Guest
    const guest = await prisma.guest.upsert({
      where: {
        idType_idNumber: {
          idType: 'KTP',
          idNumber: '3578017777770001',
        },
      },
      update: {
        fullName: 'E2E Report Guest',
        phoneWhatsapp: '081277778888',
      },
      create: {
        idType: 'KTP',
        idNumber: '3578017777770001',
        fullName: 'E2E Report Guest',
        phoneWhatsapp: '081277778888',
        address: 'Jl. Ahmad Yani No. 1, Pasuruan',
      },
    });
    guestId = guest.id;

    // 4. Setup Sample Reservations
    const now = new Date();
    const res1 = await prisma.reservation.create({
      data: {
        roomId: roomId1,
        guestId,
        bookingSource: 'WALK_IN',
        checkInTime: now,
        expectedCheckOutTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        actualCheckOutTime: new Date(now.getTime() + 22 * 60 * 60 * 1000),
        totalNights: 1,
        roomRate: 200000,
        additionalCharges: 0,
        totalAmount: 200000,
        paymentMethod: 'CASH',
        invoiceNumber: 'INV/SH/20260930/9901',
        receptionistUserId: recUser.id,
      },
    });
    reservationId1 = res1.id;

    const res2 = await prisma.reservation.create({
      data: {
        roomId: roomId2,
        guestId,
        bookingSource: 'REDDOORZ',
        reddoorzBookingCode: 'RD-9902',
        checkInTime: now,
        expectedCheckOutTime: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        totalNights: 2,
        roomRate: 350000,
        additionalCharges: 50000,
        totalAmount: 750000,
        paymentMethod: 'REDDOORZ_PREPAID',
        invoiceNumber: 'INV/SH/20260930/9902',
        receptionistUserId: recUser.id,
      },
    });
    reservationId2 = res2.id;

    // 5. Setup Initial Activity Log
    await prisma.activityLog.create({
      data: {
        userId: recUser.id,
        actionType: 'CHECK_IN',
        resourceType: 'reservation',
        resourceId: res1.id,
        details: { roomNumber: '901', invoiceNumber: res1.invoiceNumber },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.activityLog.deleteMany({
        where: { resourceId: { in: [reservationId1, reservationId2] } },
      });
      await prisma.activityLog.deleteMany({
        where: { actionType: 'EXPORT_REPORT' },
      });
      await prisma.reservation.deleteMany({
        where: { id: { in: [reservationId1, reservationId2] } },
      });
      await prisma.guest.deleteMany({
        where: { id: guestId },
      });
      await prisma.room.deleteMany({
        where: { id: { in: [roomId1, roomId2] } },
      });
      await prisma.user.deleteMany({
        where: { username: { in: ['e2e_rep_receptionist', 'e2e_rep_manager'] } },
      });
    }
    await app.close();
  });

  describe('GET /api/audit-logs', () => {
    it('harus menolak request tanpa token (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/audit-logs');
      expect(res.status).toBe(401);
    });

    it('harus menolak akses role RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('harus mengembalikan daftar audit logs dengan pagination untuk MANAGER (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs?limit=10')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('page', 1);
      expect(res.body.pagination).toHaveProperty('limit', 10);
      expect(res.body.pagination).toHaveProperty('totalItems');
      expect(res.body.pagination).toHaveProperty('totalPages');
    });

    it('harus dapat memfilter audit log berdasarkan actionType', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs?actionType=CHECK_IN')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((item: any) => item.actionType === 'CHECK_IN')).toBe(true);
    });
  });

  describe('GET /api/reports/summary', () => {
    it('harus menolak akses role RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('harus mengembalikan ringkasan KPI eksekutif untuk MANAGER (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalCheckIn');
      expect(res.body.data).toHaveProperty('totalCheckOut');
      expect(res.body.data).toHaveProperty('occupancyRate');
      expect(res.body.data).toHaveProperty('channelComposition');
      expect(res.body.data.channelComposition).toHaveProperty('reddoorz');
      expect(res.body.data.channelComposition).toHaveProperty('walkIn');
      expect(res.body.data).toHaveProperty('totalNetRevenue');
      expect(res.body.data.totalNetRevenue).toBeGreaterThanOrEqual(950000);
    });
  });

  describe('GET /api/reports/transactions', () => {
    it('harus menolak akses role RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/transactions')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('harus mengembalikan daftar transaksi dengan pagination untuk MANAGER (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/transactions?limit=10')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.data.some((t: any) => t.invoiceNumber === 'INV/SH/20260930/9901')).toBe(
        true,
      );
    });

    it('harus dapat memfilter transaksi berdasarkan roomType dan bookingSource', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/transactions?bookingSource=REDDOORZ')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((t: any) => t.bookingSource === 'REDDOORZ')).toBe(true);
    });
  });

  describe('GET /api/reports/export-excel', () => {
    it('harus menolak akses role RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/export-excel')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('harus mengunduh berkas binary Excel (.xlsx) dan mencatat ke activity_logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/export-excel')
        .set('Authorization', `Bearer ${managerToken}`)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('attachment; filename=');

      const buf = Buffer.from(res.body);
      expect(buf[0]).toBe(0x50); // PK zip header
      expect(buf[1]).toBe(0x4b);

      // Pastikan tercatat di audit log
      const exportLog = await prisma.activityLog.findFirst({
        where: { actionType: 'EXPORT_REPORT' },
        orderBy: { createdAt: 'desc' },
      });
      expect(exportLog).not.toBeNull();
      expect((exportLog?.details as any)?.format).toBe('excel');
    });
  });

  describe('GET /api/reports/export-pdf', () => {
    it('harus menolak akses role RECEPTIONIST (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/export-pdf')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(403);
    });

    it('harus mengunduh berkas binary PDF (%PDF) dan mencatat ke activity_logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/export-pdf')
        .set('Authorization', `Bearer ${managerToken}`)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');

      const buf = Buffer.from(res.body);
      expect(buf.subarray(0, 4).toString('utf-8')).toBe('%PDF');

      // Pastikan tercatat di audit log
      const exportLog = await prisma.activityLog.findFirst({
        where: { actionType: 'EXPORT_REPORT' },
        orderBy: { createdAt: 'desc' },
      });
      expect(exportLog).not.toBeNull();
      expect((exportLog?.details as any)?.format).toBe('pdf');
    });
  });
});
