import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BookingSource, PaymentMethod } from '../../../generated/prisma/client.js';

export class QueryReportTransactionsDto {
  @ApiPropertyOptional({
    description: 'Tanggal awal transaksi check-in (YYYY-MM-DD atau ISO)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Tanggal akhir transaksi check-in (YYYY-MM-DD atau ISO)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tipe kamar (misal Standard, Superior, Deluxe)',
    example: 'Deluxe',
  })
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional({
    description: 'Metode pembayaran',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Sumber pemesanan tamu (REDDOORZ / WALK_IN)',
    enum: BookingSource,
    example: BookingSource.WALK_IN,
  })
  @IsOptional()
  @IsEnum(BookingSource)
  bookingSource?: BookingSource;

  @ApiPropertyOptional({
    description: 'Halaman data (default: 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Jumlah data per halaman (default: 20, maks: 100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
