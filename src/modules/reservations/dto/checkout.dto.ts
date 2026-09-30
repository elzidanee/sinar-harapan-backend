import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AdditionalChargeItemDto {
  @ApiProperty({
    example: 'Late Check-out (2 jam)',
    description: 'Keterangan rincian biaya tambahan',
  })
  @IsString()
  label: string;

  @ApiProperty({
    example: 50000,
    description: 'Nominal biaya tambahan (Rupiah)',
  })
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CheckoutDto {
  @ApiPropertyOptional({
    type: [AdditionalChargeItemDto],
    description: 'Daftar rincian biaya tambahan (misal denda, laundry, minibar)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalChargeItemDto)
  additionalCharges?: AdditionalChargeItemDto[] = [];

  @ApiPropertyOptional({
    example: '2026-09-30T14:00:00.000Z',
    description:
      'Waktu aktual check-out tamu (ISO 8601). Jika tidak diisi, menggunakan waktu saat ini.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'actualCheckOutTime harus berupa format ISO 8601 string' })
  actualCheckOutTime?: string;
}
