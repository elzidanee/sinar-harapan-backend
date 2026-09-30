import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: '101', description: 'Nomor fisik kamar' })
  @IsString()
  @IsNotEmpty({ message: 'Nomor kamar wajib diisi' })
  @MaxLength(10)
  roomNumber: string;

  @ApiProperty({
    example: 'Standard',
    enum: ['Standard', 'Superior', 'Deluxe', 'Family'],
    description: 'Tipe kamar',
  })
  @IsString()
  @IsIn(['Standard', 'Superior', 'Deluxe', 'Family'], {
    message: 'Tipe kamar harus Standard, Superior, Deluxe, atau Family',
  })
  roomType: string;

  @ApiProperty({ example: 1, description: 'Lantai lokasi kamar' })
  @Type(() => Number)
  @IsInt({ message: 'Lantai harus berupa angka bulat' })
  @Min(0, { message: 'Lantai minimal 0' })
  floor: number;

  @ApiProperty({ example: 250000, description: 'Tarif dasar kamar per malam' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Tarif kamar harus berupa angka' })
  @IsPositive({ message: 'Tarif kamar harus bernilai positif' })
  basePricePerNight: number;

  @ApiProperty({
    example: ['AC', 'TV', 'WiFi'],
    required: false,
    type: [String],
    description: 'Daftar fasilitas kamar',
  })
  @IsOptional()
  @IsArray({ message: 'Fasilitas harus berupa array string' })
  @IsString({ each: true, message: 'Setiap fasilitas harus berupa string' })
  facilities?: string[];
}
