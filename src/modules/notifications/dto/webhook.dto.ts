import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WebhookDto {
  @ApiPropertyOptional({
    example: 'msg-12345',
    description: 'ID pesan yang dikembalikan provider WhatsApp Gateway',
  })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({
    example: 'msg-12345',
    description: 'ID pesan alternatif dari provider (misal Fonnte id)',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    example: 'delivered',
    description: 'Status pengiriman pesan (sent, delivered, read, failed)',
  })
  @IsString()
  status: string;

  @ApiPropertyOptional({
    example: '6281234567890',
    description: 'Nomor WhatsApp pengirim',
  })
  @IsOptional()
  @IsString()
  sender?: string;

  @ApiPropertyOptional({
    example: '6281298765432',
    description: 'Nomor WhatsApp tujuan',
  })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({
    example: 'Pesan pengingat...',
    description: 'Konten pesan yang dikirim/diterima',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T13:05:00Z',
    description: 'Waktu terjadinya event dari provider',
  })
  @IsOptional()
  @IsString()
  timestamp?: string;
}
