import { Injectable } from '@nestjs/common';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import React from 'react';
import { Prisma } from '../../generated/prisma/client.js';

export interface InvoicePdfData {
  invoiceNumber: string;
  checkInTime: Date | string;
  expectedCheckOutTime: Date | string;
  actualCheckOutTime?: Date | string | null;
  totalNights: number;
  roomRate: number | Prisma.Decimal;
  additionalCharges?: number | Prisma.Decimal;
  additionalChargesDetail?: Prisma.JsonValue | Array<{ label: string; amount: number }>;
  totalAmount: number | Prisma.Decimal;
  paymentMethod: string;
  paymentStatus?: string;
  guest: {
    fullName: string;
    phoneWhatsapp: string;
    idType: string;
    idNumber: string;
    nationality?: string | null;
  };
  room: {
    roomNumber: string;
    roomType: string;
  };
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#0284c7',
    paddingBottom: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hotelName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  hotelSub: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  invoiceBadge: {
    textAlign: 'right',
  },
  invoiceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0284c7',
  },
  invoiceNumber: {
    fontSize: 10,
    color: '#334155',
    marginTop: 2,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 3,
  },
  grid2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gridCol: {
    width: '48%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  label: {
    color: '#64748b',
  },
  val: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  colDesc: {
    flex: 3,
  },
  colAmount: {
    flex: 1,
    textAlign: 'right',
  },
  totalContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
    paddingTop: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  grandTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284c7',
  },
  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 8,
    color: '#94a3b8',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
});

function formatRupiah(amount: number | Prisma.Decimal): string {
  const num = typeof amount === 'number' ? amount : Number(amount);
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function formatDate(dateVal: Date | string | null | undefined): string {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID');
}

@Injectable()
export class InvoiceService {
  async generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `INV/SH/${datePart}/`;

    const countToday = await tx.reservation.count({
      where: { invoiceNumber: { startsWith: prefix } },
    });

    let seqNumber = countToday + 1;
    let invoiceNumber = `${prefix}${String(seqNumber).padStart(4, '0')}`;

    // Safety net against potential duplicate sequence numbers
    while (await tx.reservation.findUnique({ where: { invoiceNumber } })) {
      seqNumber += 1;
      invoiceNumber = `${prefix}${String(seqNumber).padStart(4, '0')}`;
    }

    return invoiceNumber;
  }

  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const additionalCharges: Array<{ label: string; amount: number }> = [];
    if (Array.isArray(data.additionalChargesDetail)) {
      for (const item of data.additionalChargesDetail as any[]) {
        if (item && typeof item === 'object' && 'label' in item && 'amount' in item) {
          additionalCharges.push({
            label: String(item.label),
            amount: Number(item.amount),
          });
        }
      }
    }

    const roomRateNum = Number(data.roomRate);
    const roomTotal = roomRateNum * data.totalNights;

    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: styles.page },
        // Header
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.hotelName }, 'HOTEL SINAR HARAPAN'),
            React.createElement(
              Text,
              { style: styles.hotelSub },
              'Jl. Raya Sinar Harapan No. 45, Malang, Jawa Timur | Telp: (0341) 555-0199',
            ),
          ),
          React.createElement(
            View,
            { style: styles.invoiceBadge },
            React.createElement(Text, { style: styles.invoiceTitle }, 'INVOICE'),
            React.createElement(Text, { style: styles.invoiceNumber }, data.invoiceNumber),
          ),
        ),

        // Grid Guest & Stay Info
        React.createElement(
          View,
          { style: styles.grid2 },
          // Col 1: Tamu
          React.createElement(
            View,
            { style: styles.gridCol },
            React.createElement(Text, { style: styles.sectionTitle }, 'INFORMASI TAMU'),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, 'Nama Lengkap:'),
              React.createElement(Text, { style: styles.val }, data.guest.fullName),
            ),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, `Identitas (${data.guest.idType}):`),
              React.createElement(Text, { style: styles.val }, data.guest.idNumber),
            ),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, 'WhatsApp:'),
              React.createElement(Text, { style: styles.val }, data.guest.phoneWhatsapp),
            ),
          ),

          // Col 2: Kamar & Menginap
          React.createElement(
            View,
            { style: styles.gridCol },
            React.createElement(Text, { style: styles.sectionTitle }, 'DETAIL MENGINAP'),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, 'Nomor Kamar:'),
              React.createElement(
                Text,
                { style: styles.val },
                `${data.room.roomNumber} (${data.room.roomType})`,
              ),
            ),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, 'Waktu Check-in:'),
              React.createElement(Text, { style: styles.val }, formatDate(data.checkInTime)),
            ),
            React.createElement(
              View,
              { style: styles.row },
              React.createElement(Text, { style: styles.label }, 'Waktu Check-out:'),
              React.createElement(
                Text,
                { style: styles.val },
                formatDate(data.actualCheckOutTime ?? data.expectedCheckOutTime),
              ),
            ),
          ),
        ),

        // Table Rincian Biaya
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'RINCIAN PEMBAYARAN'),
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: styles.colDesc }, 'Deskripsi'),
            React.createElement(Text, { style: styles.colAmount }, 'Jumlah'),
          ),

          // Sewa Kamar
          React.createElement(
            View,
            { style: styles.tableRow },
            React.createElement(
              Text,
              { style: styles.colDesc },
              `Sewa Kamar (${data.totalNights} Malam x ${formatRupiah(roomRateNum)})`,
            ),
            React.createElement(Text, { style: styles.colAmount }, formatRupiah(roomTotal)),
          ),

          // Biaya Tambahan
          ...additionalCharges.map((item, idx) =>
            React.createElement(
              View,
              { key: idx, style: styles.tableRow },
              React.createElement(Text, { style: styles.colDesc }, item.label),
              React.createElement(Text, { style: styles.colAmount }, formatRupiah(item.amount)),
            ),
          ),

          // Ringkasan Total
          React.createElement(
            View,
            { style: styles.totalContainer },
            React.createElement(
              View,
              { style: styles.totalRow },
              React.createElement(Text, { style: styles.label }, 'Metode Pembayaran:'),
              React.createElement(Text, { style: styles.val }, `${data.paymentMethod} (LUNAS)`),
            ),
            React.createElement(
              View,
              { style: styles.totalRow },
              React.createElement(Text, { style: [styles.val, styles.grandTotal] }, 'TOTAL AKHIR:'),
              React.createElement(
                Text,
                { style: [styles.val, styles.grandTotal] },
                formatRupiah(data.totalAmount),
              ),
            ),
          ),
        ),

        // Footer
        React.createElement(
          View,
          { style: styles.footer },
          React.createElement(
            Text,
            null,
            'Terima kasih telah menginap di Hotel Sinar Harapan. Semoga perjalanan Anda menyenangkan!',
          ),
        ),
      ),
    );

    const stream = await pdf(doc).toBuffer();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
