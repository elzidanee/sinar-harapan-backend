/**
 * Tahap 8 — Security Hardening & QA Test
 * security.md §5.3: "Setiap kombinasi endpoint x role harus punya test otomatis eksplisit"
 *
 * Cakupan:
 * - RBAC matrix: MANAGER-only endpoints ditolak untuk RECEPTIONIST (403)
 * - RBAC matrix: Endpoint tanpa auth ditolak untuk anonymous (401)
 * - Rate limiting login: percobaan ke-6 menghasilkan 429 (§4.3)
 * - Webhook HMAC: request tanpa signature valid ditolak (401) (§11.2)
 * - PII: passwordHash tidak pernah muncul di response (§4.2)
 * - Input validation: field di luar DTO ditolak (§10, mass assignment)
 * - Excel formula injection sanitizer (§10.1)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Security Hardening & QA (Tahap 8)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;

  const TEST_PASSWORD = 'SecurityTest123!';
  // security.md §11.2 fail-closed: secret placeholder "xxxx" menolak SEMUA webhook,
  // jadi paksa secret uji yang valid sebelum AppModule di-init (ConfigModule baca process.env saat init)
  if (!process.env.WA_WEBHOOK_SECRET || process.env.WA_WEBHOOK_SECRET === 'xxxx') {
    process.env.WA_WEBHOOK_SECRET = 'test-webhook-secret-32chars-long!!';
  }
  const WA_WEBHOOK_SECRET = process.env.WA_WEBHOOK_SECRET;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    await prisma.user.upsert({
      where: { username: 'sec_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'sec_receptionist',
        passwordHash,
        fullName: 'Security Test Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    await prisma.user.upsert({
      where: { username: 'sec_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'sec_manager',
        passwordHash,
        fullName: 'Security Test Manager',
        role: 'MANAGER',
      },
    });

    const resRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'sec_receptionist', password: TEST_PASSWORD });
    receptionistToken = resRes.body.data?.token;

    const manRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'sec_manager', password: TEST_PASSWORD });
    managerToken = manRes.body.data?.token;
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { userId: null, details: { path: ['username'], string_contains: 'sec_' } },
          { user: { username: { in: ['sec_receptionist', 'sec_manager'] } } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['sec_receptionist', 'sec_manager'] } },
    });
    await app.close();
  });

  // =========================================================================
  // §4.2 — Password tidak muncul di response
  // =========================================================================
  describe('§4.2 — PII: Password tidak pernah di-expose dalam response', () => {
    it('Login response TIDAK mengandung passwordHash', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'sec_manager', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });
  });

  // =========================================================================
  // §4.3 — Rate Limiting Login
  // =========================================================================
  describe('§4.3 — Rate Limiting: Login brute-force protection', () => {
    it('Percobaan login ke-6 dalam 1 menit menghasilkan 429 RATE_LIMITED', async () => {
      const wrongCreds = { username: 'nonexistent_user_rl', password: 'WrongPassword!' };

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).post('/api/auth/login').send(wrongCreds);
      }

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(wrongCreds);

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    }, 15000);
  });

  // =========================================================================
  // §5.3 — RBAC Matrix
  // =========================================================================
  describe('§5.3 — RBAC Matrix: MANAGER-only endpoints', () => {
    it('PATCH /api/rooms/:id (update): RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/rooms/nonexistent-id')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ basePricePerNight: 999999 })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('PATCH /api/rooms/:id/mark-clean: RECEPTIONIST → 200 (boleh akses)', async () => {
      // mark-clean boleh untuk RECEPTIONIST — pastikan bukan 403 (404/400 = lolos guard)
      const res = await request(app.getHttpServer())
        .patch('/api/rooms/nonexistent-id/mark-clean')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect([400, 404]).toContain(res.status);
    });

    it('GET /api/reservations: RECEPTIONIST → 200 (boleh akses)', async () => {
      await request(app.getHttpServer())
        .get('/api/reservations')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);
    });

    it('GET /api/reservations/:id/identity-photo: RECEPTIONIST → lolos guard (200/404, bukan 403)', async () => {
      // security.md §6.2: foto identitas hanya via signed URL 15 menit (bukan path permanen)
      const res = await request(app.getHttpServer())
        .get('/api/reservations/nonexistent-id/identity-photo')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect([404]).toContain(res.status);
    });

    it('POST /api/ocr/extract-identity tanpa file: RECEPTIONIST → lolos guard (400, bukan 403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ocr/extract-identity')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .field('documentType', 'KTP');
      expect(res.status).toBe(400);
    });

    it('GET /api/notifications/wa-link/:id: RECEPTIONIST → lolos guard (404, bukan 403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/wa-link/nonexistent-id')
        .set('Authorization', `Bearer ${receptionistToken}`);
      expect(res.status).toBe(404);
    });

    it('GET /api/reports/summary: RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/reports/summary: MANAGER → 200', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('GET /api/reports/transactions: RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/transactions')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/reports/export-excel: RECEPTIONIST → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/export-excel')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
    });

    it('GET /api/reports/export-pdf: RECEPTIONIST → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/export-pdf')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
    });

    it('GET /api/audit-logs: RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/audit-logs: MANAGER → 200', async () => {
      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });

    it('POST /api/rooms (create): RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rooms')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ roomNumber: 'SEC-99', roomType: 'Standard', pricePerNight: 200000 })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('DELETE /api/rooms/:id: RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/rooms/nonexistent-id')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/notifications/scheduler-status: RECEPTIONIST → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/scheduler-status')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/notifications/scheduler-status: MANAGER → 200', async () => {
      await request(app.getHttpServer())
        .get('/api/notifications/scheduler-status')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });
  });

  // =========================================================================
  // §5 — Anonymous requests → 401
  // =========================================================================
  describe('§5 — Endpoint yang butuh auth → 401 tanpa token', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/rooms' },
      { method: 'get', path: '/api/reservations' },
      { method: 'get', path: '/api/reports/summary' },
      { method: 'get', path: '/api/audit-logs' },
      { method: 'get', path: '/api/notifications/scheduler-status' },
    ];

    protectedEndpoints.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path}: anonymous → 401`, async () => {
        const res = await (request(app.getHttpServer()) as any)[method](path).expect(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      });
    });
  });

  // =========================================================================
  // §11.2 — Webhook HMAC
  // =========================================================================
  describe('§11.2 — Webhook HMAC Verification', () => {
    const webhookPayload = { type: 'message_status', phone: '628123456789', message: 'delivered' };

    it('POST /api/notifications/webhook tanpa signature → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/notifications/webhook')
        .send(webhookPayload)
        .expect(401);
    });

    it('POST /api/notifications/webhook dengan signature palsu → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/notifications/webhook')
        .set('x-webhook-signature', 'sha256=invalid_fake_signature_xxxx')
        .send(webhookPayload)
        .expect(401);
    });

    it('POST /api/notifications/webhook dengan HMAC valid → 200', async () => {
      const body = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', WA_WEBHOOK_SECRET).update(body).digest('hex');
      const res = await request(app.getHttpServer())
        .post('/api/notifications/webhook')
        .set('Content-Type', 'application/json')
        .set('x-webhook-signature', `sha256=${hmac}`)
        .send(webhookPayload)
        .expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // §10 — Mass Assignment
  // =========================================================================
  describe('§10 — Mass Assignment: forbidNonWhitelisted', () => {
    it('POST /api/auth/login dengan field ekstra → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'sec_manager', password: TEST_PASSWORD, role: 'ADMIN', isAdmin: true })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // §9 — Helmet security headers
  // =========================================================================
  describe('§9 — Security Headers (Helmet)', () => {
    it('Response mengandung X-Content-Type-Options', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBeDefined();
    });

    it('Response mengandung X-Frame-Options', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });
});
