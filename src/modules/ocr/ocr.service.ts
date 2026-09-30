import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ExternalServiceException } from '../../common/errors/app.exception.js';
import { StorageService } from '../storage/storage.service.js';
import { DocumentType } from './dto/extract-identity.dto.js';
import { createWorker } from 'tesseract.js';

interface GoogleVisionResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
    };
    textAnnotations?: Array<{
      description?: string;
    }>;
    error?: {
      message?: string;
      code?: number;
    };
  }>;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly storageService: StorageService,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_VISION_API_KEY');
    this.timeoutMs = Number(this.config.get<number>('OCR_TIMEOUT_MS') ?? 3000);
  }

  /**
   * Ekstraksi identitas tamu dari berkas gambar dokumen
   */
  async extractIdentity(
    imageBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    documentType: DocumentType,
  ) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      throw new BadRequestException(
        'Format gambar tidak didukung. Harap unggah berkas bertipe JPEG, PNG, atau WebP',
      );
    }

    // 1. Simpan gambar ke storage bucket privat (folder temp/) dan buat Signed URL 15 menit
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const tempPath = `temp/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;

    let tempImageUrl: string | null = null;
    try {
      await this.storageService.uploadFile(imageBuffer, tempPath, mimeType);
      tempImageUrl = await this.storageService.createSignedUrl(tempPath, 900);
    } catch (storageError) {
      this.logger.warn('Gagal menyimpan foto ke storage sementara:', storageError);
      tempImageUrl = null;
    }

    // 2. Ekstraksi teks dari gambar: Coba Google Vision terlebih dahulu, jika gagal otomatis fallback ke Tesseract.js
    let rawText = '';
    try {
      rawText = await this.callGoogleVision(imageBuffer);
    } catch (visionError) {
      this.logger.warn(
        `Google Vision tidak tersedia (${(visionError as Error)?.message}). Menggunakan OCR lokal Tesseract.js...`,
      );
      try {
        rawText = await this.callLocalTesseract(imageBuffer);
      } catch (tesseractError) {
        this.logger.error('OCR lokal (Tesseract) juga gagal:', tesseractError);
        throw new ExternalServiceException(
          'Layanan OCR tidak merespons, gunakan input manual',
        );
      }
    }

    // 3. Dispatch parser berdasarkan jenis dokumen (KTP/SIM/Paspor)
    let parsedResult;
    switch (documentType) {
      case 'KTP':
        parsedResult = this.parseKtpText(rawText);
        break;
      case 'SIM':
        parsedResult = this.parseSimText(rawText);
        break;
      case 'PASSPORT':
        parsedResult = this.parsePassportMrz(rawText);
        break;
      default:
        throw new BadRequestException(`documentType tidak dikenali: ${String(documentType)}`);
    }

    return {
      ...parsedResult,
      tempImageUrl,
    };
  }

  /**
   * Memanggil Google Cloud Vision Document Text Detection API dengan timeout 3 detik
   */
  async callGoogleVision(imageBuffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      this.logger.error('GOOGLE_VISION_API_KEY tidak disetel di environment variables');
      throw new ExternalServiceException(
        'Layanan OCR tidak merespons, gunakan input manual',
      );
    }

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`;
    const payload = {
      requests: [
        {
          image: {
            content: imageBuffer.toString('base64'),
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
            },
          ],
        },
      ],
    };

    const request$ = this.httpService
      .post<GoogleVisionResponse>(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      })
      .pipe(
        timeout(this.timeoutMs),
        catchError((err) => {
          this.logger.warn(`Google Vision API error atau timeout: ${err?.message}`);
          return throwError(
            () =>
              new ExternalServiceException(
                'Layanan OCR tidak merespons, gunakan input manual',
              ),
          );
        }),
      );

    try {
      const response = await firstValueFrom(request$);
      const firstResponse = response.data?.responses?.[0];

      if (firstResponse?.error) {
        this.logger.warn(`Google Vision returned error: ${firstResponse.error.message}`);
        throw new ExternalServiceException(
          'Layanan OCR tidak merespons, gunakan input manual',
        );
      }

      return (
        firstResponse?.fullTextAnnotation?.text ??
        firstResponse?.textAnnotations?.[0]?.description ??
        ''
      );
    } catch (error) {
      if (error instanceof ExternalServiceException) {
        throw error;
      }
      this.logger.error('Unhandled error saat memanggil Google Vision:', error);
      throw new ExternalServiceException(
        'Layanan OCR tidak merespons, gunakan input manual',
      );
    }
  }

  /**
   * Ekstraksi teks menggunakan engine OCR lokal Tesseract.js (bebas biaya & offline)
   */
  async callLocalTesseract(imageBuffer: Buffer): Promise<string> {
    this.logger.log('Memproses OCR menggunakan engine lokal Tesseract.js...');
    const worker = await createWorker(['eng', 'ind']);
    try {
      const result = await worker.recognize(imageBuffer);
      return result.data.text ?? '';
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Parser 1: KTP (Ekstraksi NIK 16 digit, Nama, dan Alamat berbasis pola teks/label)
   */
  parseKtpText(rawText: string) {
    const nikMatch = rawText.match(/\b\d{16}\b/);
    const namaMatch = rawText.match(/Nama\s*[:-]?\s*([A-Za-z\s]+)/i);
    const alamatMatch = rawText.match(/Alamat\s*[:-]?\s*([A-Za-z0-9\s.,/-]+)/i);

    // Ambil baris pertama dari nama jika multiline
    const cleanedNama = namaMatch?.[1]?.split('\n')[0]?.trim() ?? null;
    const cleanedAlamat = alamatMatch?.[1]?.split('\n')[0]?.trim() ?? null;

    const parsed = {
      idType: 'KTP' as const,
      idNumber: nikMatch?.[0] ?? null,
      namaLengkap: cleanedNama,
      alamat: cleanedAlamat,
      nationality: 'Indonesia',
    };

    const fieldsFound = [parsed.idNumber, parsed.namaLengkap, parsed.alamat].filter(
      Boolean,
    ).length;
    const confidence = Number((fieldsFound / 3).toFixed(2));

    return {
      ...parsed,
      confidence,
      perluVerifikasiManual: confidence < 0.7,
    };
  }

  /**
   * Parser 2: SIM (Ekstraksi Nomor SIM 12-16 digit, Nama, dan Golongan SIM)
   */
  parseSimText(rawText: string) {
    const noSimMatch = rawText.match(/\b\d{12,16}\b/);
    const namaMatch = rawText.match(/Nama\s*[:-]?\s*([A-Za-z\s]+)/i);
    const golonganMatch = rawText.match(/\b(SIM\s?[ABC][I]?)\b/i);

    const cleanedNama = namaMatch?.[1]?.split('\n')[0]?.trim() ?? null;

    const parsed = {
      idType: 'SIM' as const,
      idNumber: noSimMatch?.[0] ?? null,
      namaLengkap: cleanedNama,
      alamat: null as string | null,
      nationality: 'Indonesia',
      golonganSim: golonganMatch?.[0]?.toUpperCase() ?? null,
    };

    const fieldsFound = [parsed.idNumber, parsed.namaLengkap].filter(Boolean).length;
    const confidence = Number((fieldsFound / 2).toFixed(2));

    return {
      ...parsed,
      confidence,
      perluVerifikasiManual: confidence < 0.7,
    };
  }

  /**
   * Parser 3: Paspor Internasional (Parsing MRZ / Machine Readable Zone format ICAO 9303)
   */
  parsePassportMrz(rawText: string) {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim().replace(/\s+/g, ''))
      .filter((l) => l.length >= 30);

    const mrzLine1 = lines.find((l) => /^P[A-Z<]/.test(l) && l.length >= 35);
    const mrzLine1Index = mrzLine1 ? lines.indexOf(mrzLine1) : -1;
    const mrzLine2 = mrzLine1Index >= 0 ? lines[mrzLine1Index + 1] : null;

    if (!mrzLine1 || !mrzLine2) {
      return {
        idType: 'PASSPORT' as const,
        idNumber: null,
        namaLengkap: null,
        alamat: null,
        nationality: null,
        confidence: 0,
        perluVerifikasiManual: true,
      };
    }

    // Baris 1: P<COUNTRYCODE<SURNAME<<GIVEN<NAMES<<<<...
    const namePart = mrzLine1
      .substring(5)
      .replace(/</g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Baris 2: Posisi 0..9 nomor paspor, 10..13 kode kewarganegaraan
    const passportNumber = mrzLine2.substring(0, 9).replace(/</g, '').trim();
    const nationalityCode = mrzLine2.substring(10, 13).replace(/</g, '').trim();

    const parsed = {
      idType: 'PASSPORT' as const,
      idNumber: passportNumber || null,
      namaLengkap: namePart || null,
      alamat: null,
      nationality: nationalityCode || null,
    };

    const fieldsFound = [
      parsed.idNumber,
      parsed.namaLengkap,
      parsed.nationality,
    ].filter(Boolean).length;
    const confidence = Number((fieldsFound / 3).toFixed(2));

    return {
      ...parsed,
      confidence,
      perluVerifikasiManual: confidence < 0.7,
    };
  }
}
