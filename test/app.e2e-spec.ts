import {
  Controller,
  Get,
  INestApplication,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Roles } from './../src/common/decorators/roles.decorator.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { JwtAuthGuard } from './../src/common/guards/jwt-auth.guard.js';
import { RolesGuard } from './../src/common/guards/roles.guard.js';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';

@Controller('test-rbac')
@UseGuards(JwtAuthGuard, RolesGuard)
class TestRbacController {
  @Get('manager-only')
  @Roles('MANAGER')
  managerOnly() {
    return { access: 'granted' };
  }
}

describe('PMS App (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRbacController],
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
    const passwordHash = await bcrypt.hash('E2eTest123!', 10);

    // Upsert Receptionist
    await prisma.user.upsert({
      where: { username: 'e2e_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_receptionist',
        passwordHash,
        fullName: 'E2E Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    // Upsert Manager
    await prisma.user.upsert({
      where: { username: 'e2e_manager' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'e2e_manager',
        passwordHash,
        fullName: 'E2E Manager',
        role: 'MANAGER',
      },
    });
  });

  afterAll(async () => {
    await prisma.activityLog.deleteMany({
      where: {
        details: {
          path: ['username'],
          string_contains: 'e2e_',
        },
      },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['e2e_receptionist', 'e2e_manager'] } },
    });
    await app.close();
  });

  describe('HealthCheck (Tahap 0)', () => {
    it('GET /health mengembalikan 200 dan database terkoneksi', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.dbConnected).toBe(true);
      expect(res.body.data.uptime).toBeDefined();
    });
  });

  describe('Auth & Activity Logging (Tahap 1)', () => {
    it('POST /api/auth/login sukses untuk RECEPTIONIST dan mengembalikan JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'e2e_receptionist', password: 'E2eTest123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('RECEPTIONIST');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      receptionistToken = res.body.data.token;
    });

    it('POST /api/auth/login sukses untuk MANAGER dan mengembalikan JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'e2e_manager', password: 'E2eTest123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('MANAGER');
      managerToken = res.body.data.token;
    });

    it('POST /api/auth/login gagal dengan password salah → 401 dan catat ke activity_logs', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'e2e_receptionist', password: 'SalahPassword!' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');

      // Verifikasi activity_logs mencatat LOGIN_FAILED
      const log = await prisma.activityLog.findFirst({
        where: {
          actionType: 'LOGIN_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).toBeDefined();
      expect(log?.actionType).toBe('LOGIN_FAILED');
    });

    it('POST /api/auth/refresh tanpa token → 401', () => {
      return request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
    });

    it('POST /api/auth/refresh dengan token valid → 200 dan token baru', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('RECEPTIONIST');
    });

    it('POST /api/auth/logout tanpa token → 401', () => {
      return request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });

    it('POST /api/auth/logout dengan token valid → 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Berhasil logout');
    });
  });

  describe('RBAC Guards (Tahap 1)', () => {
    it('mengakses endpoint ber-guard tanpa token → 401 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-rbac/manager-only')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('mengakses endpoint MANAGER dengan role RECEPTIONIST → 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-rbac/manager-only')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Role RECEPTIONIST tidak memiliki akses');
    });

    it('mengakses endpoint MANAGER dengan role MANAGER → 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-rbac/manager-only')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.access).toBe('granted');
    });
  });
});
