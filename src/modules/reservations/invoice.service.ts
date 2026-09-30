import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

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
}
