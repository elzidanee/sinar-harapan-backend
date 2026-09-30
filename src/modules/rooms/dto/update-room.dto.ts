import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RoomStatus } from '../../../generated/prisma/client.js';

export class UpdateRoomDto {
  @ApiProperty({ example: '101', required: false, description: 'Nomor fisik kamar' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  roomNumber?: string;

  @ApiProperty({
    example: 'Standard',
    required: false,
    enum: ['Standard', 'Superior', 'Deluxe', 'Family'],
    description: 'Tipe kamar',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Standard', 'Superior', 'Deluxe', 'Family'], {
    message: 'Tipe kamar harus Standard, Superior, Deluxe, atau Family',
  })
  roomType?: string;

  @ApiProperty({ example: 1, required: false, description: 'Lantai lokasi kamar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Lantai harus berupa angka bulat' })
  @Min(0, { message: 'Lantai minimal 0' })
  floor?: number;

  @ApiProperty({ example: 280000, required: false, description: 'Tarif dasar kamar per malam' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Tarif kamar harus berupa angka' })
  @IsPositive({ message: 'Tarif kamar harus bernilai positif' })
  basePricePerNight?: number;

  @ApiProperty({
    example: ['AC', 'TV', 'WiFi', 'Water Heater'],
    required: false,
    type: [String],
    description: 'Daftar fasilitas kamar',
  })
  @IsOptional()
  @IsArray({ message: 'Fasilitas harus berupa array string' })
  @IsString({ each: true, message: 'Setiap fasilitas harus berupa string' })
  facilities?: string[];

  @ApiProperty({
    example: 'MAINTENANCE',
    required: false,
    enum: RoomStatus,
    description: 'Status ketersediaan kamar',
  })
  @IsOptional()
  @IsEnum(RoomStatus, { message: 'Status kamar tidak valid' })
  status?: RoomStatus;
}
