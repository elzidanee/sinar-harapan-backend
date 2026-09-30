import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { QueryReportTransactionsDto } from './dto/query-report-transactions.dto.js';
import { ReportDateRangeDto } from './dto/report-date-range.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@Controller('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({
    summary: 'Melihat ringkasan metrik performa eksekutif (Khusus MANAGER)',
  })
  @ApiResponse({
    status: 200,
    description: 'Ringkasan KPI berhasil dihitung',
  })
  @Get('summary')
  getSummary(@Query() query: ReportDateRangeDto) {
    return this.reportsService.getSummary(query);
  }

  @ApiOperation({
    summary: 'Melihat tabel rekapitulasi data transaksi terfilter (Khusus MANAGER)',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar transaksi berhasil diambil',
  })
  @Get('transactions')
  getTransactions(@Query() query: QueryReportTransactionsDto) {
    return this.reportsService.getTransactions(query);
  }

  @ApiOperation({
    summary: 'Unduh laporan performa & raw data transaksi dalam format Excel (.xlsx)',
  })
  @ApiResponse({
    status: 200,
    description: 'File Excel (.xlsx) berhasil di-generate',
  })
  @Get('export-excel')
  async exportExcel(
    @Query() query: ReportDateRangeDto,
    @CurrentUser() user: { id?: string },
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportExcel(query, user?.id);
    const start = query.startDate ?? 'awal';
    const end = query.endDate ?? 'akhir';
    const filename = `laporan-sinar-harapan-${start}-${end}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @ApiOperation({
    summary: 'Unduh laporan performa resmi format PDF A4 dengan tanda tangan pengesahan',
  })
  @ApiResponse({
    status: 200,
    description: 'File PDF (.pdf) berhasil di-generate',
  })
  @Get('export-pdf')
  async exportPdf(
    @Query() query: ReportDateRangeDto,
    @CurrentUser() user: { id?: string },
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportPdf(query, user?.id);
    const start = query.startDate ?? 'awal';
    const end = query.endDate ?? 'akhir';
    const filename = `laporan-sinar-harapan-${start}-${end}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
