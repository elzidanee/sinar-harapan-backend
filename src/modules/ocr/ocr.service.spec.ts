import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceException } from '../../common/errors/app.exception.js';
import { StorageService } from '../storage/storage.service.js';
import { OcrService } from './ocr.service.js';

describe('OcrService', () => {
  let service: OcrService;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };
  let storageService: {
    uploadFile: ReturnType<typeof vi.fn>;
    createSignedUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    httpService = {
      post: vi.fn(),
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'GOOGLE_VISION_API_KEY') return 'test-google-api-key';
        if (key === 'OCR_TIMEOUT_MS') return 3000;
        return null;
      }),
    };
    storageService = {
      uploadFile: vi.fn().mockResolvedValue('temp/test-image.jpg'),
      createSignedUrl: vi
        .fn()
        .mockResolvedValue('https://test.supabase.co/storage/v1/temp/test-image.jpg?token=abc'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  describe('parseKtpText', () => {
    it('berhasil mengekstrak NIK, Nama, dan Alamat dari teks KTP', () => {
      const rawKtp = `
        PROVINSI JAWA TIMUR
        KOTA MALANG
        NIK : 3578012345670001
        Nama : BUDI SANTOSO
        Tempat/Tgl Lahir : MALANG, 10-05-1990
        Alamat : JL. MERDEKA NO. 10, MALANG
        RT/RW : 001/002
        Kewarganegaraan : WNI
      `;

      const result = service.parseKtpText(rawKtp);
      expect(result.idType).toBe('KTP');
      expect(result.idNumber).toBe('3578012345670001');
      expect(result.namaLengkap).toBe('BUDI SANTOSO');
      expect(result.alamat).toBe('JL. MERDEKA NO. 10, MALANG');
      expect(result.nationality).toBe('Indonesia');
      expect(result.confidence).toBe(1);
      expect(result.perluVerifikasiManual).toBe(false);
    });

    it('menandai perluVerifikasiManual: true bila data KTP buram atau kurang lengkap', () => {
      const incompleteKtp = `
        PROVINSI JAWA TIMUR
        Nama : JOKO
        (NIK buram tidak terbaca)
      `;

      const result = service.parseKtpText(incompleteKtp);
      expect(result.idType).toBe('KTP');
      expect(result.idNumber).toBeNull();
      expect(result.namaLengkap).toBe('JOKO');
      expect(result.confidence).toBeLessThan(0.7);
      expect(result.perluVerifikasiManual).toBe(true);
    });
  });

  describe('parseSimText', () => {
    it('berhasil mengekstrak Nomor SIM, Nama, dan Golongan SIM', () => {
      const rawSim = `
        SURAT IZIN MENGEMUDI
        DRIVING LICENSE
        SIM A
        123456789012
        Nama : SITI AMINAH
        Alamat : JL. SUDIRMAN NO. 45
        Pekerjaan : KARYAWAN SWASTA
      `;

      const result = service.parseSimText(rawSim);
      expect(result.idType).toBe('SIM');
      expect(result.idNumber).toBe('123456789012');
      expect(result.namaLengkap).toBe('SITI AMINAH');
      expect(result.golonganSim).toBe('SIM A');
      expect(result.nationality).toBe('Indonesia');
      expect(result.confidence).toBe(1);
      expect(result.perluVerifikasiManual).toBe(false);
    });
  });

  describe('parsePassportMrz', () => {
    it('berhasil memparsing MRZ Paspor 2-baris sesuai standar ICAO 9303', () => {
      const rawPassport = `
        PASSPORT
        REPUBLIK INDONESIA
        P<IDNPRATAMA<<ANDI<<<<<<<<<<<<<<<<<<<<<<<<<<<
        A123456781IDN9001019M3001015<<<<<<<<<<<<<<02
      `;

      const result = service.parsePassportMrz(rawPassport);
      expect(result.idType).toBe('PASSPORT');
      expect(result.idNumber).toBe('A12345678');
      expect(result.namaLengkap).toBe('PRATAMA ANDI');
      expect(result.nationality).toBe('IDN');
      expect(result.confidence).toBe(1);
      expect(result.perluVerifikasiManual).toBe(false);
    });

    it('mengembalikan confidence 0 bila MRZ tidak ditemukan', () => {
      const invalidPassport = `
        PASSPORT
        Foto paspor buram tanpa teks baris MRZ di bawah
      `;

      const result = service.parsePassportMrz(invalidPassport);
      expect(result.idType).toBe('PASSPORT');
      expect(result.idNumber).toBeNull();
      expect(result.namaLengkap).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.perluVerifikasiManual).toBe(true);
    });
  });

  describe('extractIdentity', () => {
    it('menolak format berkas selain gambar yang didukung (mis. PDF)', async () => {
      const buffer = Buffer.from('dummy');
      await expect(
        service.extractIdentity(buffer, 'document.pdf', 'application/pdf', 'KTP'),
      ).rejects.toThrow(BadRequestException);
    });

    it('berhasil memproses gambar KTP lengkap dengan tempImageUrl dan confidence', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            responses: [
              {
                fullTextAnnotation: {
                  text: 'NIK : 3578012345670001\nNama : BUDI SANTOSO\nAlamat : JL. MERDEKA NO. 10',
                },
              },
            ],
          },
        }),
      );

      // Gunakan buffer dengan JPEG magic bytes valid (FF D8 FF) — security.md §10 validasi magic bytes
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(50).fill(0x00)]);
      const result = await service.extractIdentity(buffer, 'ktp.jpg', 'image/jpeg', 'KTP');

      expect(result.idType).toBe('KTP');
      expect(result.idNumber).toBe('3578012345670001');
      expect(result.namaLengkap).toBe('BUDI SANTOSO');
      expect(result.tempImageUrl).toContain('https://test.supabase.co');
      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(storageService.createSignedUrl).toHaveBeenCalled();
    });

    it('berhasil fallback ke OCR lokal Tesseract jika Google Vision error', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Google Vision 403 Billing')),
      );
      vi.spyOn(service, 'callLocalTesseract').mockResolvedValue(
        'NIK : 3578012345670001\nNama : BUDI SANTOSO\nAlamat : JL. MERDEKA NO. 10',
      );

      // Buffer dengan JPEG magic bytes valid
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(50).fill(0x00)]);
      const result = await service.extractIdentity(buffer, 'ktp.jpg', 'image/jpeg', 'KTP');

      expect(result.idType).toBe('KTP');
      expect(result.idNumber).toBe('3578012345670001');
      expect(result.namaLengkap).toBe('BUDI SANTOSO');
      expect(service.callLocalTesseract).toHaveBeenCalled();
    });

    it('melempar ExternalServiceException jika Google Vision dan Tesseract keduanya gagal', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Google Vision Timeout')),
      );
      vi.spyOn(service, 'callLocalTesseract').mockRejectedValue(
        new Error('Tesseract failed to read image'),
      );

      // Buffer dengan JPEG magic bytes valid agar lolos magic bytes check
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(50).fill(0x00)]);
      await expect(
        service.extractIdentity(buffer, 'ktp.jpg', 'image/jpeg', 'KTP'),
      ).rejects.toThrow(ExternalServiceException);
    });
  });

  // =====================================================================
  // security.md §10 — Magic Bytes Validation (File Type Spoofing Prevention)
  // =====================================================================
  describe('extractIdentity — validasi magic bytes (security.md §10)', () => {
    it('menolak file dengan MIME type tidak didukung → BadRequestException', async () => {
      const buffer = Buffer.alloc(20, 0x00);
      await expect(
        service.extractIdentity(buffer, 'test.gif', 'image/gif', 'KTP'),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak file yang mengklaim image/jpeg tapi bukan JPEG (magic bytes palsu)', async () => {
      // Attacker kirim Content-Type: image/jpeg tapi isi file adalah EXE (MZ header)
      const fakeBuffer = Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      await expect(
        service.extractIdentity(fakeBuffer, 'malicious.exe', 'image/jpeg', 'KTP'),
      ).rejects.toThrow(BadRequestException);
    });

    it('menerima file JPEG yang valid (magic bytes FF D8 FF)', async () => {
      // Real JPEG header
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        ...new Array(50).fill(0x00),
      ]);
      httpService.post.mockReturnValue(
        of({
          data: {
            responses: [{ fullTextAnnotation: { text: 'NIK : 3578012345670001\nNama : Budi' } }],
          },
        }),
      );
      // Tidak boleh throw — proses dilanjutkan ke Google Vision
      await expect(
        service.extractIdentity(jpegBuffer, 'ktp.jpg', 'image/jpeg', 'KTP'),
      ).resolves.toBeDefined();
    });

    it('menerima file PNG yang valid (magic bytes 89 50 4E 47)', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        ...new Array(50).fill(0x00),
      ]);
      httpService.post.mockReturnValue(
        of({
          data: {
            responses: [{ fullTextAnnotation: { text: 'NIK : 3578012345670001\nNama : Budi' } }],
          },
        }),
      );
      await expect(
        service.extractIdentity(pngBuffer, 'ktp.png', 'image/png', 'KTP'),
      ).resolves.toBeDefined();
    });

    it('menerima file WebP yang valid (magic bytes RIFF....WEBP)', async () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size (dummy)
        0x57, 0x45, 0x42, 0x50, // WEBP
        ...new Array(50).fill(0x00),
      ]);
      httpService.post.mockReturnValue(
        of({
          data: {
            responses: [{ fullTextAnnotation: { text: 'NIK : 3578012345670001\nNama : Budi' } }],
          },
        }),
      );
      await expect(
        service.extractIdentity(webpBuffer, 'ktp.webp', 'image/webp', 'KTP'),
      ).resolves.toBeDefined();
    });
  });
});
