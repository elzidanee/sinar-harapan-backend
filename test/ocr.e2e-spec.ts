import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { of } from 'rxjs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('OCR (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let receptionistToken: string;

  beforeAll(async () => {
    const mockHttpService = {
      post: (url: string) => {
        if (url.includes('vision.googleapis.com')) {
          return of({
            data: {
              responses: [
                {
                  fullTextAnnotation: {
                    text: 'PROVINSI JAWA TIMUR\nNIK : 3578012345670001\nNama : BUDI SANTOSO\nAlamat : JL. MERDEKA NO. 10',
                  },
                },
              ],
            },
          });
        }
        if (url.includes('storage/v1/object/sign')) {
          return of({
            data: {
              signedURL: '/object/sign/identity-documents/temp/mock.jpg?token=mocktoken',
            },
          });
        }
        // upload object
        return of({ data: { Key: 'identity-documents/temp/mock.jpg' } });
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    const passwordHash = await bcrypt.hash('OcrTest123!', 10);

    await prisma.user.upsert({
      where: { username: 'ocr_receptionist' },
      update: { passwordHash, isActive: true },
      create: {
        username: 'ocr_receptionist',
        passwordHash,
        fullName: 'OCR Receptionist',
        role: 'RECEPTIONIST',
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'ocr_receptionist', password: 'OcrTest123!' });
    receptionistToken = loginRes.body.data.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { username: 'ocr_receptionist' },
    });
    await app.close();
  });

  describe('POST /api/ocr/extract-identity', () => {
    it('menolak akses tanpa token → 401 UNAUTHORIZED', async () => {
      await request(app.getHttpServer())
        .post('/api/ocr/extract-identity')
        .expect(401);
    });

    it('menolak request jika tidak ada file gambar yang diunggah → 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ocr/extract-identity')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .field('documentType', 'KTP')
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('File gambar wajib diunggah');
    });

    it('menolak request jika documentType tidak valid → 400 VALIDATION_ERROR', async () => {
      const dummyImage = Buffer.from('fake-image-bytes');

      const res = await request(app.getHttpServer())
        .post('/api/ocr/extract-identity')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .attach('image', dummyImage, { filename: 'test.jpg', contentType: 'image/jpeg' })
        .field('documentType', 'KARTU_KELUARGA')
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('berhasil mengekstrak data KTP dari unggahan gambar multipart/form-data → 200 OK', async () => {
      const dummyImage = Buffer.from('fake-image-bytes');

      const res = await request(app.getHttpServer())
        .post('/api/ocr/extract-identity')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .attach('image', dummyImage, { filename: 'ktp.jpg', contentType: 'image/jpeg' })
        .field('documentType', 'KTP')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.idType).toBe('KTP');
      expect(res.body.data.idNumber).toBe('3578012345670001');
      expect(res.body.data.namaLengkap).toBe('BUDI SANTOSO');
      expect(res.body.data.alamat).toContain('JL. MERDEKA NO. 10');
      expect(res.body.data.confidence).toBeGreaterThanOrEqual(0.7);
      expect(res.body.data.perluVerifikasiManual).toBe(false);
      expect(res.body.data.tempImageUrl).toBeDefined();
    });
  });
});
