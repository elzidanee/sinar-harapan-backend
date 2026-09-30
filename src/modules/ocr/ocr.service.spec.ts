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

      const buffer = Buffer.from('dummy-image');
      const result = await service.extractIdentity(buffer, 'ktp.jpg', 'image/jpeg', 'KTP');

      expect(result.idType).toBe('KTP');
      expect(result.idNumber).toBe('3578012345670001');
      expect(result.namaLengkap).toBe('BUDI SANTOSO');
      expect(result.tempImageUrl).toContain('https://test.supabase.co');
      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(storageService.createSignedUrl).toHaveBeenCalled();
    });

    it('melempar ExternalServiceException jika Google Vision error atau timeout', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Google Vision Timeout')),
      );

      const buffer = Buffer.from('dummy-image');
      await expect(
        service.extractIdentity(buffer, 'ktp.jpg', 'image/jpeg', 'KTP'),
      ).rejects.toThrow(ExternalServiceException);
    });
  });
});
