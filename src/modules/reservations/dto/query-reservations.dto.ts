import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class QueryReservationsDto {
  @ApiPropertyOptional({
    enum: ['ACTIVE', 'COMPLETED'],
    description: 'Filter status reservasi (ACTIVE = belum checkout, COMPLETED = sudah checkout)',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'COMPLETED'], {
    message: 'status harus berupa ACTIVE atau COMPLETED',
  })
  status?: 'ACTIVE' | 'COMPLETED';

  @ApiPropertyOptional({
    description: 'Filter berdasarkan tipe kamar (misal Standard, Deluxe)',
    example: 'Deluxe',
  })
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional({
    enum: ['CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID'],
    description: 'Filter berdasarkan metode pembayaran',
  })
  @IsOptional()
  @IsEnum(['CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID'])
  paymentMethod?: 'CASH' | 'QRIS' | 'TRANSFER' | 'REDDOORZ_PREPAID';

  @ApiPropertyOptional({
    description: 'Filter tanggal mulai check-in (ISO Date / YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tanggal akhir check-in (ISO Date / YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Nomor halaman untuk pagination',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Jumlah data per halaman',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number = 20;
}
