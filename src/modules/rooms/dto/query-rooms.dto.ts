import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { RoomStatus } from '../../../generated/prisma/client.js';

export class QueryRoomsDto {
  @ApiPropertyOptional({
    enum: ['Standard', 'Superior', 'Deluxe', 'Family'],
    description: 'Filter berdasarkan tipe kamar',
  })
  @IsOptional()
  @IsString()
  roomType?: string;

  @ApiPropertyOptional({ example: 1, description: 'Filter berdasarkan nomor lantai' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional({
    enum: RoomStatus,
    description: 'Filter berdasarkan status ketersediaan kamar',
  })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional({ example: 1, description: 'Nomor halaman untuk pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @ApiPropertyOptional({ example: 50, description: 'Jumlah data per halaman' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
