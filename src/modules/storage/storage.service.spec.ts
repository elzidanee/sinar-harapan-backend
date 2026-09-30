import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service.js';

describe('StorageService', () => {
  let service: StorageService;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    httpService = {
      post: vi.fn(),
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-key';
        if (key === 'SUPABASE_STORAGE_BUCKET') return 'identity-documents';
        if (key === 'SUPABASE_SIGNED_URL_EXPIRY_SECONDS') return 900;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('uploadFile', () => {
    it('mengirim buffer ke endpoint storage Supabase dengan header otorisasi service_role', async () => {
      httpService.post.mockReturnValue(of({ data: { Key: 'identity-documents/temp/photo.jpg' } }));

      const buffer = Buffer.from('test-image-content');
      const result = await service.uploadFile(buffer, 'temp/photo.jpg', 'image/jpeg');

      expect(result).toBe('temp/photo.jpg');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://test.supabase.co/storage/v1/object/identity-documents/temp/photo.jpg',
        buffer,
        {
          headers: {
            Authorization: 'Bearer test-service-key',
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
          },
        },
      );
    });
  });

  describe('createSignedUrl', () => {
    it('membuat signed URL dengan masa kedaluwarsa sesuai konfigurasi', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            signedURL: '/object/sign/identity-documents/temp/photo.jpg?token=abc123token',
          },
        }),
      );

      const signedUrl = await service.createSignedUrl('temp/photo.jpg', 900);

      expect(signedUrl).toBe(
        'https://test.supabase.co/storage/v1/object/sign/identity-documents/temp/photo.jpg?token=abc123token',
      );
      expect(httpService.post).toHaveBeenCalledWith(
        'https://test.supabase.co/storage/v1/object/sign/identity-documents/temp/photo.jpg',
        { expiresIn: 900 },
        {
          headers: {
            Authorization: 'Bearer test-service-key',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('mengembalikan URL langsung jika respons sudah berbentuk URL absolut', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            signedURL: 'https://test.supabase.co/storage/v1/object/sign/temp/photo.jpg?token=abc',
          },
        }),
      );

      const signedUrl = await service.createSignedUrl('temp/photo.jpg');
      expect(signedUrl).toBe(
        'https://test.supabase.co/storage/v1/object/sign/temp/photo.jpg?token=abc',
      );
    });
  });
});
