import { Injectable, Logger } from '@nestjs/common';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import React from 'react';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { QueryReportTransactionsDto } from './dto/query-report-transactions.dto.js';
import { ReportDateRangeDto } from './dto/report-date-range.dto.js';

export interface ReportSummaryResult {
  totalCheckIn: number;
  totalCheckOut: number;
  occupancyRate: number;
  channelComposition: {
    reddoorz: number;
    walkIn: number;
  };
  totalNetRevenue: number;
}

const pdfStyles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#0284c7',
    paddingBottom: 10,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hotelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  hotelSub: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  reportTitleBox: {
    textAlign: 'right',
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0284c7',
  },
  reportSubtitle: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  kpiContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 8,
    textAlign: 'center',
  },
  kpiLabel: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  kpiValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
    marginTop: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    fontWeight: 'bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    fontSize: 7.5,
  },
  colNo: { width: '5%', padding: 4, textAlign: 'center' },
  colInv: { width: '22%', padding: 4 },
  colRoom: { width: '12%', padding: 4 },
  colGuest: { width: '23%', padding: 4 },
  colSource: { width: '13%', padding: 4 },
  colMethod: { width: '10%', padding: 4 },
  colTotal: { width: '15%', padding: 4, textAlign: 'right' },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    paddingRight: 10,
  },
  signatureBox: {
    width: 170,
    textAlign: 'center',
  },
  signatureLine: {
    marginTop: 45,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    textAlign: 'center',
    fontSize: 7,
    color: '#94a3b8',
  },
});

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Helper untuk mengurai rentang tanggal default (awal bulan s/d akhir bulan jika kosong)
   */
  private parseDateRange(query: ReportDateRangeDto): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (query.startDate) {
      start = new Date(query.startDate);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    if (query.endDate) {
      end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    return { start, end };
  }

  /**
   * 1. GET /reports/summary (FR-REP-01)
   * Mengembalikan KPI eksekutif dashboard: Check-in, Check-out, Okupansi, Komposisi Kanal, dan Pendapatan
   */
  async getSummary(query: ReportDateRangeDto): Promise<ReportSummaryResult> {
    const { start, end } = this.parseDateRange(query);

    // Hitung Check-in dalam periode
    const totalCheckIn = await this.prisma.reservation.count({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
    });

    // Hitung Check-out yang selesai dalam periode
    const totalCheckOut = await this.prisma.reservation.count({
      where: {
        actualCheckOutTime: {
          not: null,
          gte: start,
          lte: end,
        },
      },
    });

    // Hitung kamar aktif (tidak sedang maintenance)
    const activeRoomsCount = await this.prisma.room.count({
      where: {
        status: { not: 'MAINTENANCE' },
      },
    });
    const totalRooms = activeRoomsCount > 0 ? activeRoomsCount : 20;

    // Hitung jumlah hari dalam periode
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const daysInPeriod = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Total room nights yang terjual dalam periode
    const roomNightsAggregate = await this.prisma.reservation.aggregate({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        totalNights: true,
      },
    });
    const soldRoomNights = roomNightsAggregate._sum.totalNights || 0;
    const capacityRoomNights = totalRooms * daysInPeriod;
    const occupancyRate =
      capacityRoomNights > 0
        ? Math.min(100, Math.round((soldRoomNights / capacityRoomNights) * 100 * 10) / 10)
        : 0;

    // Komposisi kanal pemesanan
    const [reddoorzCount, walkInCount] = await Promise.all([
      this.prisma.reservation.count({
        where: {
          checkInTime: { gte: start, lte: end },
          bookingSource: 'REDDOORZ',
        },
      }),
      this.prisma.reservation.count({
        where: {
          checkInTime: { gte: start, lte: end },
          bookingSource: 'WALK_IN',
        },
      }),
    ]);

    // Total pendapatan bersih (total_amount)
    const revenueAggregate = await this.prisma.reservation.aggregate({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalNetRevenue = Number(revenueAggregate._sum.totalAmount || 0);

    return {
      totalCheckIn,
      totalCheckOut,
      occupancyRate,
      channelComposition: {
        reddoorz: reddoorzCount,
        walkIn: walkInCount,
      },
      totalNetRevenue,
    };
  }

  /**
   * 2. GET /reports/transactions (FR-REP-02)
   * Mengembalikan rekapitulasi data transaksi dengan filter dan pagination
   */
  async getTransactions(query: QueryReportTransactionsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReservationWhereInput = {};

    if (query.startDate || query.endDate) {
      const checkInFilter: Prisma.DateTimeFilter = {};
      if (query.startDate) {
        const s = new Date(query.startDate);
        s.setHours(0, 0, 0, 0);
        checkInFilter.gte = s;
      }
      if (query.endDate) {
        const e = new Date(query.endDate);
        e.setHours(23, 59, 59, 999);
        checkInFilter.lte = e;
      }
      where.checkInTime = checkInFilter;
    }

    if (query.roomType) {
      where.room = {
        roomType: {
          contains: query.roomType,
          mode: 'insensitive',
        },
      };
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.bookingSource) {
      where.bookingSource = query.bookingSource;
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        include: {
          guest: true,
          room: true,
          receptionist: {
            select: {
              fullName: true,
            },
          },
        },
        orderBy: { checkInTime: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * 3. GET /reports/export-excel (FR-REP-03, FR-REP-05)
   * Ekspor laporan Excel (.xlsx) dengan 2 sheet: Summary KPI & Raw Data Detail Transaksi
   */
  async exportExcel(query: ReportDateRangeDto, userId?: string): Promise<Buffer> {
    const { start, end } = this.parseDateRange(query);
    const summary = await this.getSummary(query);

    const transactions = await this.prisma.reservation.findMany({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
      include: {
        guest: true,
        room: true,
        receptionist: { select: { fullName: true } },
      },
      orderBy: { checkInTime: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Hotel Sinar Harapan PMS';
    workbook.created = new Date();

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // --- SHEET 1: Summary KPI ---
    const sheetKpi = workbook.addWorksheet('Summary KPI');

    sheetKpi.columns = [
      { header: 'Indikator Kinerja (KPI)', key: 'kpi', width: 34 },
      { header: 'Nilai', key: 'value', width: 26 },
      { header: 'Keterangan', key: 'desc', width: 30 },
    ];

    // Title Block
    sheetKpi.spliceRows(1, 0, [
      ['LAPORAN KINERJA OPERASIONAL & PENDAPATAN'],
      ['Hotel Sinar Harapan (Mitra RedDoorz)'],
      [`Periode: ${startStr} s/d ${endStr}`],
      [],
    ]);

    sheetKpi.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF0284C7' } };
    sheetKpi.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    sheetKpi.getRow(3).font = { bold: true, size: 10 };

    const kpiHeaderRow = sheetKpi.getRow(5);
    kpiHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    kpiHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0284C7' },
    };

    sheetKpi.addRows([
      {
        kpi: 'Total Tamu Check-in',
        value: summary.totalCheckIn,
        desc: 'Reservasi aktif pada periode',
      },
      {
        kpi: 'Total Tamu Check-out',
        value: summary.totalCheckOut,
        desc: 'Tamu yang telah menyelesaikan masa menginap',
      },
      {
        kpi: 'Rasio Okupansi Kamar',
        value: `${summary.occupancyRate}%`,
        desc: 'Kamar terjual vs kapasitas aktif',
      },
      {
        kpi: 'Komposisi Kanal: RedDoorz',
        value: summary.channelComposition.reddoorz,
        desc: 'Pemesanan melalui aplikasi OTA RedDoorz',
      },
      {
        kpi: 'Komposisi Kanal: Walk-in',
        value: summary.channelComposition.walkIn,
        desc: 'Tamu langsung datang ke meja resepsionis',
      },
      {
        kpi: 'Total Akumulasi Pendapatan',
        value: summary.totalNetRevenue,
        desc: 'Total penerimaan kamar & biaya tambahan',
      },
    ]);

    // Format currency on Total Pendapatan cell
    const revRow = sheetKpi.getRow(11);
    revRow.getCell(2).numFmt = '"Rp" #,##0';
    revRow.font = { bold: true };

    // --- SHEET 2: Raw Data Detail Transaksi ---
    const sheetData = workbook.addWorksheet('Detail Transaksi');

    sheetData.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'No. Invoice', key: 'invoiceNumber', width: 22 },
      { header: 'Tanggal Check-in', key: 'checkIn', width: 18 },
      { header: 'Tanggal Check-out', key: 'checkOut', width: 18 },
      { header: 'No. Kamar', key: 'roomNumber', width: 12 },
      { header: 'Tipe Kamar', key: 'roomType', width: 14 },
      { header: 'Jenis Identitas', key: 'idType', width: 14 },
      { header: 'Nomor Identitas', key: 'idNumber', width: 20 },
      { header: 'Nama Lengkap Tamu', key: 'guestName', width: 25 },
      { header: 'No. WhatsApp', key: 'phone', width: 16 },
      { header: 'Sumber', key: 'source', width: 14 },
      { header: 'Metode Bayar', key: 'method', width: 18 },
      { header: 'Total Biaya (Rp)', key: 'total', width: 18 },
      { header: 'Operator', key: 'operator', width: 20 },
    ];

    const dataHeaderRow = sheetData.getRow(1);
    dataHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dataHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };

    transactions.forEach((tx, idx) => {
      const row = sheetData.addRow({
        no: idx + 1,
        invoiceNumber: tx.invoiceNumber,
        checkIn: new Date(tx.checkInTime).toISOString().replace('T', ' ').substring(0, 16),
        checkOut: tx.actualCheckOutTime
          ? new Date(tx.actualCheckOutTime).toISOString().replace('T', ' ').substring(0, 16)
          : new Date(tx.expectedCheckOutTime).toISOString().replace('T', ' ').substring(0, 16),
        roomNumber: tx.room.roomNumber,
        roomType: tx.room.roomType,
        idType: tx.guest.idType,
        idNumber: tx.guest.idNumber,
        guestName: tx.guest.fullName,
        phone: tx.guest.phoneWhatsapp,
        source: tx.bookingSource,
        method: tx.paymentMethod,
        total: Number(tx.totalAmount),
        operator: tx.receptionist?.fullName || 'Sistem',
      });

      row.getCell('total').numFmt = '"Rp" #,##0';
    });

    // Catat ke activity_logs (FR-REP-05)
    await this.auditLogsService.log({
      userId,
      actionType: 'EXPORT_REPORT',
      resourceType: 'report',
      details: {
        format: 'excel',
        range: { startDate: startStr, endDate: endStr },
        totalRecords: transactions.length,
      },
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 4. GET /reports/export-pdf (FR-REP-04, FR-REP-05)
   * Ekspor dokumen laporan resmi A4 PDF dengan ringkasan performa dan tabel transaksi
   */
  async exportPdf(query: ReportDateRangeDto, userId?: string): Promise<Buffer> {
    const { start, end } = this.parseDateRange(query);
    const summary = await this.getSummary(query);

    const transactions = await this.prisma.reservation.findMany({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
      include: {
        guest: true,
        room: true,
      },
      orderBy: { checkInTime: 'asc' },
      take: 50, // Batasi untuk tata letak halaman PDF agar rapi
    });

    const startStr = start.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const endStr = end.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const formatCurrency = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: pdfStyles.page },
        // Header Kop
        React.createElement(
          View,
          { style: pdfStyles.header },
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: pdfStyles.hotelName }, 'HOTEL SINAR HARAPAN'),
            React.createElement(
              Text,
              { style: pdfStyles.hotelSub },
              'Mitra Resmi RedDoorz | Jl. Samanhudi No. 10, Pasuruan, Jawa Timur',
            ),
          ),
          React.createElement(
            View,
            { style: pdfStyles.reportTitleBox },
            React.createElement(Text, { style: pdfStyles.reportTitle }, 'LAPORAN OPERASIONAL'),
            React.createElement(
              Text,
              { style: pdfStyles.reportSubtitle },
              `Periode: ${startStr} - ${endStr}`,
            ),
          ),
        ),

        // KPI Summary Cards
        React.createElement(
          View,
          { style: pdfStyles.kpiContainer },
          React.createElement(
            View,
            { style: pdfStyles.kpiCard },
            React.createElement(Text, { style: pdfStyles.kpiLabel }, 'Rasio Okupansi'),
            React.createElement(Text, { style: pdfStyles.kpiValue }, `${summary.occupancyRate}%`),
          ),
          React.createElement(
            View,
            { style: pdfStyles.kpiCard },
            React.createElement(Text, { style: pdfStyles.kpiLabel }, 'Total Check-in'),
            React.createElement(Text, { style: pdfStyles.kpiValue }, String(summary.totalCheckIn)),
          ),
          React.createElement(
            View,
            { style: pdfStyles.kpiCard },
            React.createElement(Text, { style: pdfStyles.kpiLabel }, 'Total Check-out'),
            React.createElement(Text, { style: pdfStyles.kpiValue }, String(summary.totalCheckOut)),
          ),
          React.createElement(
            View,
            { style: pdfStyles.kpiCard },
            React.createElement(Text, { style: pdfStyles.kpiLabel }, 'Total Pendapatan'),
            React.createElement(
              Text,
              { style: [pdfStyles.kpiValue, { fontSize: 10 }] },
              formatCurrency(summary.totalNetRevenue),
            ),
          ),
        ),

        // Komposisi Kanal Box
        React.createElement(
          Text,
          { style: pdfStyles.sectionTitle },
          `Komposisi Pemesanan: RedDoorz (${summary.channelComposition.reddoorz}) | Walk-in (${summary.channelComposition.walkIn})`,
        ),

        // Tabel Rekapitulasi Transaksi
        React.createElement(
          View,
          { style: pdfStyles.table },
          React.createElement(
            View,
            { style: pdfStyles.tableHeader },
            React.createElement(Text, { style: pdfStyles.colNo }, 'No'),
            React.createElement(Text, { style: pdfStyles.colInv }, 'No. Invoice'),
            React.createElement(Text, { style: pdfStyles.colRoom }, 'Kamar'),
            React.createElement(Text, { style: pdfStyles.colGuest }, 'Nama Tamu'),
            React.createElement(Text, { style: pdfStyles.colSource }, 'Sumber'),
            React.createElement(Text, { style: pdfStyles.colMethod }, 'Metode'),
            React.createElement(Text, { style: pdfStyles.colTotal }, 'Total Biaya'),
          ),
          ...transactions.map((tx, idx) =>
            React.createElement(
              View,
              { key: tx.id, style: pdfStyles.tableRow },
              React.createElement(Text, { style: pdfStyles.colNo }, String(idx + 1)),
              React.createElement(Text, { style: pdfStyles.colInv }, tx.invoiceNumber),
              React.createElement(
                Text,
                { style: pdfStyles.colRoom },
                `${tx.room.roomNumber} (${tx.room.roomType})`,
              ),
              React.createElement(Text, { style: pdfStyles.colGuest }, tx.guest.fullName),
              React.createElement(Text, { style: pdfStyles.colSource }, tx.bookingSource),
              React.createElement(Text, { style: pdfStyles.colMethod }, tx.paymentMethod),
              React.createElement(
                Text,
                { style: pdfStyles.colTotal },
                formatCurrency(Number(tx.totalAmount)),
              ),
            ),
          ),
        ),

        // Bagian Tanda Tangan Pengesahan Manajer
        React.createElement(
          View,
          { style: pdfStyles.signatureSection },
          React.createElement(
            View,
            { style: pdfStyles.signatureBox },
            React.createElement(
              Text,
              null,
              `Pasuruan, ${new Date().toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`,
            ),
            React.createElement(Text, { style: { marginTop: 2 } }, 'Manajer Operasional Hotel'),
            React.createElement(View, { style: pdfStyles.signatureLine }),
            React.createElement(
              Text,
              { style: { marginTop: 4, fontWeight: 'bold' } },
              'Hotel Sinar Harapan',
            ),
          ),
        ),

        // Footer
        React.createElement(
          View,
          { style: pdfStyles.footer },
          React.createElement(
            Text,
            null,
            `Dokumen ini dihasilkan secara otomatis oleh Sistem PMS Hotel Sinar Harapan pada ${new Date().toISOString()}`,
          ),
        ),
      ),
    );

    const stream = await pdf(doc).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Catat ke activity_logs (FR-REP-05)
    await this.auditLogsService.log({
      userId,
      actionType: 'EXPORT_REPORT',
      resourceType: 'report',
      details: {
        format: 'pdf',
        range: { startDate: start.toISOString(), endDate: end.toISOString() },
        totalRecords: transactions.length,
      },
    });

    return pdfBuffer;
  }
}
