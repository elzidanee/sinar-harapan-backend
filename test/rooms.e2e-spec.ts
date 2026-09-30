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

describe('Rooms (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;
  let createdRoomId: string;

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
    const passwordHash = await bcrypt.hash('RoomTest123!', 10);

    // Upsert Receptionist User for Room Tests
    await prisma.user.upsert({
      where: { username: 'room_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'room_receptionist',
        passwordHash,
        fullName: 'Room Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    // Upsert Manager User for Room Tests
    await prisma.user.upsert({
      where: { username: 'room_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'room_manager',
        passwordHash,
        fullName: 'Room Manager',
        role: 'MANAGER',
      },
    });

    // Login Receptionist
    const recLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'room_receptionist', password: 'RoomTest123!' });
    receptionistToken = recLogin.body.data.token;

    // Login Manager
    const mgrLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'room_manager', password: 'RoomTest123!' });
    managerToken = mgrLogin.body.data.token;
  });

  afterAll(async () => {
    if (createdRoomId) {
      await prisma.room.deleteMany({ where: { id: createdRoomId } });
    }
    await prisma.room.deleteMany({ where: { roomNumber: { in: ['888', '889'] } } });
    await prisma.activityLog.deleteMany({
      where: {
        details: {
          path: ['username'],
          string_contains: 'room_',
        },
      },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['room_receptionist', 'room_manager'] } },
    });
    await app.close();
  });

  describe('POST /api/rooms', () => {
    it('menolak request tanpa token → 401 UNAUTHORIZED', async () => {
      await request(app.getHttpServer())
        .post('/api/rooms')
        .send({
          roomNumber: '888',
          roomType: 'Deluxe',
          floor: 8,
          basePricePerNight: 500000,
        })
        .expect(401);
    });

    it('menolak request dari role RECEPTIONIST → 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rooms')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          roomNumber: '888',
          roomType: 'Deluxe',
          floor: 8,
          basePricePerNight: 500000,
        })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('berhasil membuat kamar oleh role MANAGER → 201 CREATED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rooms')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          roomNumber: '888',
          roomType: 'Deluxe',
          floor: 8,
          basePricePerNight: 500000,
          facilities: ['AC', 'TV', 'Bathtub'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.roomNumber).toBe('888');
      expect(res.body.data.status).toBe('AVAILABLE');
      createdRoomId = res.body.data.id;
    });

    it('menolak pembuatan kamar dengan nomor duplikat → 409 CONFLICT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rooms')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          roomNumber: '888',
          roomType: 'Standard',
          floor: 1,
          basePricePerNight: 250000,
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('GET /api/rooms & GET /api/rooms/status', () => {
    it('GET /api/rooms dapat diakses oleh RECEPTIONIST', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rooms')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((r: { roomNumber: string }) => r.roomNumber === '888')).toBe(true);
    });

    it('GET /api/rooms/status mengembalikan array minimal untuk grid polling', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rooms/status')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const roomStatus = res.body.data.find((r: { roomNumber: string }) => r.roomNumber === '888');
      expect(roomStatus).toBeDefined();
      expect(roomStatus.status).toBe('AVAILABLE');
      expect(roomStatus.id).toBeDefined();
      expect(roomStatus.updatedAt).toBeDefined();
    });
  });

  describe('GET /api/rooms/:id', () => {
    it('mengembalikan detail kamar beserta activeReservation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.roomNumber).toBe('888');
      expect(res.body.data.activeReservation).toBeNull();
    });

    it('mengembalikan 404 NOT_FOUND jika kamar tidak ada', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rooms/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/rooms/:id', () => {
    it('menolak update dari role RECEPTIONIST → 403 FORBIDDEN', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ basePricePerNight: 550000 })
        .expect(403);
    });

    it('berhasil update tarif kamar oleh role MANAGER → 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ basePricePerNight: 550000 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.basePricePerNight)).toBe(550000);
    });

    it('berhasil mengubah status kamar ke MAINTENANCE oleh MANAGER → 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'MAINTENANCE' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('MAINTENANCE');
    });
  });

  describe('PATCH /api/rooms/:id/mark-clean', () => {
    it('berhasil mengubah status kamar DIRTY menjadi AVAILABLE oleh RECEPTIONIST', async () => {
      // Set status kamar ke DIRTY di database
      await prisma.room.update({
        where: { id: createdRoomId },
        data: { status: 'DIRTY' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/rooms/${createdRoomId}/mark-clean`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AVAILABLE');
    });
  });

  describe('DELETE /api/rooms/:id', () => {
    it('menolak delete dari role RECEPTIONIST → 403 FORBIDDEN', async () => {
      await request(app.getHttpServer())
        .delete(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
    });

    it('berhasil menghapus kamar oleh role MANAGER → 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Kamar berhasil dihapus');

      // Verifikasi bahwa kamar sudah tidak ada lagi
      await request(app.getHttpServer())
        .get(`/api/rooms/${createdRoomId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
    });
  });
});
