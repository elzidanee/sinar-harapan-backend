import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabaseUrl?: string;
  private readonly serviceRoleKey?: string;
  private readonly bucket: string;
  private readonly defaultExpirySeconds: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.supabaseUrl = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '');
    this.serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucket =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'identity-documents';
    this.defaultExpirySeconds = Number(
      this.config.get<number>('SUPABASE_SIGNED_URL_EXPIRY_SECONDS') ?? 900,
    );
  }

  /**
   * Mengunggah file buffer ke Supabase Storage privat
   * @param buffer Berkas binary buffer
   * @param filePath Path relatif di dalam bucket (mis. 'temp/xyz.jpg' atau 'guests/xyz.jpg')
   * @param mimeType MIME type (mis. 'image/jpeg')
   * @returns Path berkas tersimpan
   */
  async uploadFile(
    buffer: Buffer,
    filePath: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak disetel. Menggunakan mock storage.',
      );
      return filePath;
    }

    const cleanPath = filePath.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${cleanPath}`;

    try {
      await firstValueFrom(
        this.httpService.post(url, buffer, {
          headers: {
            Authorization: `Bearer ${this.serviceRoleKey}`,
            'Content-Type': mimeType,
            'x-upsert': 'true',
          },
        }),
      );
      return cleanPath;
    } catch (error) {
      this.logger.error(`Gagal upload berkas ke Supabase Storage: ${url}`, error);
      throw error;
    }
  }

  /**
   * Menerbitkan Signed URL sementara (default 15 menit)
   * @param filePath Path relatif di dalam bucket
   * @param expiresInSeconds Waktu kedaluwarsa URL dalam detik
   * @returns Signed URL lengkap yang dapat diakses sementara
   */
  async createSignedUrl(
    filePath: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    const cleanPath = filePath.replace(/^\/+/, '');
    const expiresIn = expiresInSeconds ?? this.defaultExpirySeconds;

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      return `https://mock.storage.local/${this.bucket}/${cleanPath}?expiresIn=${expiresIn}`;
    }

    const url = `${this.supabaseUrl}/storage/v1/object/sign/${this.bucket}/${cleanPath}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ signedURL: string }>(
          url,
          { expiresIn },
          {
            headers: {
              Authorization: `Bearer ${this.serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const rawSigned = response.data.signedURL;
      if (rawSigned.startsWith('http://') || rawSigned.startsWith('https://')) {
        return rawSigned;
      }
      return `${this.supabaseUrl}/storage/v1${rawSigned}`;
    } catch (error) {
      this.logger.error(`Gagal membuat Signed URL untuk: ${cleanPath}`, error);
      throw error;
    }
  }
}
