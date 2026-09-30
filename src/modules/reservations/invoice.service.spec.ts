import { describe, expect, it, vi } from 'vitest';
import { InvoiceService } from './invoice.service.js';

describe('InvoiceService', () => {
  const service = new InvoiceService();

  it('men-generate nomor invoice pertama hari ini dengan format INV/SH/YYYYMMDD/0001', async () => {
    const mockTx = {
      reservation: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any;

    const invoiceNumber = await service.generateInvoiceNumber(mockTx);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    expect(invoiceNumber).toBe(`INV/SH/${today}/0001`);
    expect(mockTx.reservation.count).toHaveBeenCalledWith({
      where: { invoiceNumber: { startsWith: `INV/SH/${today}/` } },
    });
  });

  it('meningkatkan sequence jika sudah ada invoice hari ini', async () => {
    const mockTx = {
      reservation: {
        count: vi.fn().mockResolvedValue(9),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any;

    const invoiceNumber = await service.generateInvoiceNumber(mockTx);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    expect(invoiceNumber).toBe(`INV/SH/${today}/0010`);
  });

  it('melakukan increment safety-net jika sequence number sudah digunakan (collision)', async () => {
    const mockTx = {
      reservation: {
        count: vi.fn().mockResolvedValue(0),
        // simulasi 0001 sudah ada, lalu 0002 belum ada
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 'existing-inv' })
          .mockResolvedValueOnce(null),
      },
    } as any;

    const invoiceNumber = await service.generateInvoiceNumber(mockTx);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    expect(invoiceNumber).toBe(`INV/SH/${today}/0002`);
    expect(mockTx.reservation.findUnique).toHaveBeenCalledTimes(2);
  });

  it('berhasil men-generate buffer PDF invoice dengan header %PDF', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      invoiceNumber: 'INV/SH/20260930/0001',
      checkInTime: new Date('2026-09-30T14:00:00Z'),
      expectedCheckOutTime: new Date('2026-10-01T12:00:00Z'),
      actualCheckOutTime: new Date('2026-10-01T12:00:00Z'),
      totalNights: 1,
      roomRate: 250000,
      additionalCharges: 50000,
      additionalChargesDetail: [{ label: 'Laundry', amount: 50000 }],
      totalAmount: 300000,
      paymentMethod: 'CASH',
      guest: {
        fullName: 'Budi Santoso',
        phoneWhatsapp: '081234567890',
        idType: 'KTP',
        idNumber: '3578012345670001',
      },
      room: {
        roomNumber: '101',
        roomType: 'Standard',
      },
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
  });
});
