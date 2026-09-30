import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ExtractIdentityDto } from './dto/extract-identity.dto.js';
import { OcrService } from './ocr.service.js';

interface UploadedMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('ocr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @ApiOperation({
    summary:
      'Ekstraksi identitas tamu otomatis dari foto KTP / Paspor / SIM via Google Cloud Vision API',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'documentType'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Foto dokumen identitas (format JPEG, PNG, atau WebP, maks 5MB)',
        },
        documentType: {
          type: 'string',
          enum: ['KTP', 'PASSPORT', 'SIM'],
          example: 'KTP',
          description: 'Jenis dokumen identitas',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Ekstraksi OCR berhasil',
  })
  @ApiResponse({
    status: 400,
    description: 'Validasi form atau file gagal',
  })
  @ApiResponse({
    status: 502,
    description: 'Layanan OCR eksternal gagal atau timeout (fallback ke input manual)',
  })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Post('extract-identity')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 5 * 1024 * 1024, // Maksimal 5 MB
      },
    }),
  )
  async extractIdentity(
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() dto: ExtractIdentityDto,
  ) {
    if (!file) {
      throw new BadRequestException('File gambar wajib diunggah (field: image)');
    }

    return this.ocrService.extractIdentity(
      file.buffer,
      file.originalname,
      file.mimetype,
      dto.documentType,
    );
  }
}
