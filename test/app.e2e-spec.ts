import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    const passwordHash = await bcrypt.hash('E2eTest123!', 10);
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: 'e2e_receptionist' } });
    await app.close();
  });

  it('POST /api/auth/login sukses dengan kredensial benar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_receptionist', password: 'E2eTest123!' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('RECEPTIONIST');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/login gagal dengan password salah → 401', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_receptionist', password: 'SalahPassword!' })
      .expect(401);
  });

  it('POST /api/auth/refresh tanpa token → 401', () => {
    return request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('POST /api/auth/logout tanpa token → 401', () => {
    return request(app.getHttpServer()).post('/api/auth/logout').expect(401);
  });
});
