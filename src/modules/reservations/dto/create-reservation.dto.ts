import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Validate,
  ValidateNested,
} from 'class-validator';
import { IdNumberFormatValidator } from './validators/id-number-format.validator.js';

export class GuestDto {
  @ApiProperty({
    enum: ['KTP', 'PASSPORT', 'SIM', 'OTHER'],
    example: 'KTP',
    description: 'Jenis dokumen identitas tamu',
  })
  @IsEnum(['KTP', 'PASSPORT', 'SIM', 'OTHER'], {
    message: 'idType harus salah satu dari KTP, PASSPORT, SIM, OTHER',
  })
  idType: 'KTP' | 'PASSPORT' | 'SIM' | 'OTHER';

  @ApiProperty({
    example: '3578012345670001',
    description: 'Nomor identitas tamu (sesuai format idType)',
  })
  @IsString()
  @Validate(IdNumberFormatValidator)
  idNumber: string;

  @ApiProperty({
    example: 'Budi Santoso',
    description: 'Nama lengkap tamu sesuai dokumen identitas',
  })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({
    example: 'Jl. Merdeka No. 10, Malang',
    description: 'Alamat lengkap tamu',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: 'Indonesia',
    description: 'Kewarganegaraan tamu (atau kode negara 3 huruf untuk Paspor)',
  })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiProperty({
    example: '081234567890',
    description: 'Nomor WhatsApp tamu untuk pengiriman bukti reservasi/reminder',
  })
  @Matches(/^(\+62|62|08)\d{7,13}$/, {
    message: 'Format nomor WA tidak valid (+62/62/08 dilanjutkan digit nomor)',
  })
  phoneWhatsapp: string;

  @ApiPropertyOptional({
    example: 'https://supabase.co/storage/v1/object/public/identity-temp/guest.jpg',
    description: 'URL foto identitas yang tersimpan di storage',
  })
  @IsOptional()
  @IsString()
  idImageUrl?: string;
}

export class CreateReservationDto {
  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    description: 'ID unik kamar yang akan di-booking',
  })
  @IsUUID('4', { message: 'roomId harus berupa UUID v4 yang valid' })
  roomId: string;

  @ApiProperty({
    enum: ['WALK_IN', 'REDDOORZ'],
    example: 'WALK_IN',
    description: 'Sumber reservasi kamar',
  })
  @IsEnum(['WALK_IN', 'REDDOORZ'], {
    message: 'bookingSource harus WALK_IN atau REDDOORZ',
  })
  bookingSource: 'WALK_IN' | 'REDDOORZ';

  @ApiPropertyOptional({
    example: 'RDZ-123456',
    description: 'Kode booking RedDoorz (wajib diisi jika bookingSource adalah REDDOORZ)',
  })
  @IsOptional()
  @IsString()
  reddoorzBookingCode?: string;

  @ApiProperty({ type: GuestDto, description: 'Data identitas tamu' })
  @ValidateNested()
  @Type(() => GuestDto)
  guest: GuestDto;

  @ApiProperty({
    example: '2026-09-30T14:00:00.000Z',
    description: 'Waktu check-in tamu (ISO 8601)',
  })
  @IsDateString({}, { message: 'checkInTime harus berupa ISO 8601 string' })
  checkInTime: string;

  @ApiProperty({
    example: '2026-10-01T12:00:00.000Z',
    description: 'Waktu perkiraan check-out tamu (ISO 8601)',
  })
  @IsDateString({}, { message: 'expectedCheckOutTime harus berupa ISO 8601 string' })
  expectedCheckOutTime: string;

  @ApiProperty({
    example: 1,
    description: 'Durasi menginap dalam jumlah malam',
  })
  @IsInt({ message: 'totalNights harus berupa bilangan bulat' })
  @IsPositive({ message: 'totalNights harus bernilai positif' })
  totalNights: number;

  @ApiProperty({
    example: 250000,
    description: 'Tarif sewa kamar per malam (Rupiah)',
  })
  @IsNumber({}, { message: 'roomRate harus berupa angka' })
  @IsPositive({ message: 'roomRate harus bernilai positif' })
  roomRate: number;

  @ApiProperty({
    enum: ['CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID'],
    example: 'CASH',
    description: 'Metode pembayaran',
  })
  @IsEnum(['CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID'], {
    message: 'paymentMethod harus salah satu dari CASH, QRIS, TRANSFER, REDDOORZ_PREPAID',
  })
  paymentMethod: 'CASH' | 'QRIS' | 'TRANSFER' | 'REDDOORZ_PREPAID';
}
