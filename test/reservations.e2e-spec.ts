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

describe('Reservations & Check-in (Tahap 4 e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;

  let room1Id: string;
  let room2Id: string;
  let room3Id: string;
  let createdReservationId: string;

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
    const passwordHash = await bcrypt.hash('ResTest123!', 10);

    // 1. Setup User Receptionist
    await prisma.user.upsert({
      where: { username: 'e2e_res_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_res_receptionist',
        passwordHash,
        fullName: 'E2E Res Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    // 2. Setup User Manager
    await prisma.user.upsert({
      where: { username: 'e2e_res_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_res_manager',
        passwordHash,
        fullName: 'E2E Res Manager',
        role: 'MANAGER',
      },
    });

    // Login Receptionist
    const recLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_res_receptionist', password: 'ResTest123!' });
    receptionistToken = recLogin.body.data.token;

    // Login Manager
    const mgrLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_res_manager', password: 'ResTest123!' });
    managerToken = mgrLogin.body.data.token;

    // 3. Setup Rooms for Testing
    const r1 = await prisma.room.upsert({
      where: { roomNumber: '701' },
      update: { status: 'AVAILABLE', basePricePerNight: 250000 },
      create: {
        roomNumber: '701',
        roomType: 'Standard',
        floor: 7,
        basePricePerNight: 250000,
        status: 'AVAILABLE',
      },
    });
    room1Id = r1.id;

    const r2 = await prisma.room.upsert({
      where: { roomNumber: '702' },
      update: { status: 'AVAILABLE', basePricePerNight: 300000 },
      create: {
        roomNumber: '702',
        roomType: 'Deluxe',
        floor: 7,
        basePricePerNight: 300000,
        status: 'AVAILABLE',
      },
    });
    room2Id = r2.id;

    const r3 = await prisma.room.upsert({
      where: { roomNumber: '703' },
      update: { status: 'AVAILABLE', basePricePerNight: 350000 },
      create: {
        roomNumber: '703',
        roomType: 'Suite',
        floor: 7,
        basePricePerNight: 350000,
        status: 'AVAILABLE',
      },
    });
    room3Id = r3.id;
  });

  afterAll(async () => {
    // Cleanup reservations & guests
    await prisma.activityLog.deleteMany({
      where: {
        actionType: 'CHECK_IN',
        details: { path: ['roomNumber'], string_contains: '70' },
      },
    });

    await prisma.reservation.deleteMany({
      where: { roomId: { in: [room1Id, room2Id, room3Id] } },
    });

    await prisma.guest.deleteMany({
      where: {
        idNumber: { in: ['3578012345670001', '3578012345670002', 'B1234567'] },
      },
    });

    await prisma.room.deleteMany({
      where: { id: { in: [room1Id, room2Id, room3Id] } },
    });

    await prisma.user.deleteMany({
      where: { username: { in: ['e2e_res_receptionist', 'e2e_res_manager'] } },
    });

    await app.close();
  });

  describe('POST /api/reservations (Check-in)', () => {
    it('menolak tanpa token → 401 UNAUTHORIZED', async () => {
      await request(app.getHttpServer())
        .post('/api/reservations')
        .send({
          roomId: room1Id,
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'KTP',
            idNumber: '3578012345670001',
            fullName: 'Budi Santoso',
            phoneWhatsapp: '081234567890',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 250000,
          paymentMethod: 'CASH',
        })
        .expect(401);
    });

    it('menolak jika nomor KTP tidak 16 digit angka → 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room1Id,
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'KTP',
            idNumber: '12345', // KTP harus 16 digit
            fullName: 'Budi Santoso',
            phoneWhatsapp: '081234567890',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 250000,
          paymentMethod: 'CASH',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('menolak booking REDDOORZ tanpa reddoorzBookingCode → 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room1Id,
          bookingSource: 'REDDOORZ',
          guest: {
            idType: 'KTP',
            idNumber: '3578012345670001',
            fullName: 'Budi Santoso',
            phoneWhatsapp: '081234567890',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 250000,
          paymentMethod: 'REDDOORZ_PREPAID',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('berhasil membuat reservasi dan check-in oleh RECEPTIONIST → 201 CREATED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room1Id,
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'KTP',
            idNumber: '3578012345670001',
            fullName: 'Budi Santoso',
            phoneWhatsapp: '081234567890',
            address: 'Jl. Merdeka No. 10, Malang',
            nationality: 'Indonesia',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 250000,
          paymentMethod: 'CASH',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.invoiceNumber).toMatch(/^INV\/SH\/\d{8}\/\d{4}$/);
      expect(res.body.data.status).toBe('OCCUPIED');
      expect(res.body.data.totalAmount).toBe(250000);

      createdReservationId = res.body.data.id;

      // Verifikasi status kamar di DB berubah menjadi OCCUPIED
      const updatedRoom = await prisma.room.findUnique({ where: { id: room1Id } });
      expect(updatedRoom?.status).toBe('OCCUPIED');
    });

    it('menolak check-in ke kamar yang sudah OCCUPIED → 409 CONFLICT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room1Id, // Kamar 701 sudah OCCUPIED
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'KTP',
            idNumber: '3578012345670002',
            fullName: 'Tamu Lain',
            phoneWhatsapp: '081299998888',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 250000,
          paymentMethod: 'CASH',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('menolak check-in jika identitas tamu (idType + idNumber) sudah aktif check-in di kamar lain → 409 CONFLICT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room3Id, // Kamar 703 masih AVAILABLE
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'KTP',
            idNumber: '3578012345670001', // Tamu Budi Santoso sudah check-in di kamar 701
            fullName: 'Budi Santoso',
            phoneWhatsapp: '081234567890',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 350000,
          paymentMethod: 'CASH',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('sedang aktif check-in di kamar lain');
    });

    it('CONCURRENCY TEST: dua request check-in bersamaan ke kamar yang sama (anti-race condition) → hanya satu sukses, satunya 409 CONFLICT', async () => {
      // Room 702 (room2Id) masih AVAILABLE
      const req1 = request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomId: room2Id,
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'PASSPORT',
            idNumber: 'B1234567',
            fullName: 'Guest Concurrency One',
            phoneWhatsapp: '081234567811',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 300000,
          paymentMethod: 'QRIS',
        });

      const req2 = request(app.getHttpServer())
        .post('/api/reservations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          roomId: room2Id,
          bookingSource: 'WALK_IN',
          guest: {
            idType: 'SIM',
            idNumber: '901234567890',
            fullName: 'Guest Concurrency Two',
            phoneWhatsapp: '081234567822',
          },
          checkInTime: new Date().toISOString(),
          expectedCheckOutTime: new Date(Date.now() + 86400000).toISOString(),
          totalNights: 1,
          roomRate: 300000,
          paymentMethod: 'CASH',
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    });
  });

  describe('GET /api/reservations & GET /api/reservations/:id', () => {
    it('GET /api/reservations dapat diakses oleh RECEPTIONIST dan mengembalikan daftar reservasi', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
    });

    it('GET /api/reservations/:id mengembalikan detail reservasi', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/reservations/${createdReservationId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdReservationId);
      expect(res.body.data.room).toBeDefined();
      expect(res.body.data.guest).toBeDefined();
    });

    it('GET /api/reservations/:id melempar 404 jika ID tidak ditemukan', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reservations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
