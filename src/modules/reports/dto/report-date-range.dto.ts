import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ReportDateRangeDto {
  @ApiPropertyOptional({
    description: 'Tanggal awal periode laporan (YYYY-MM-DD atau ISO)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Tanggal akhir periode laporan (YYYY-MM-DD atau ISO)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
