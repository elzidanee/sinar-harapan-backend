import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { InvoiceService } from './invoice.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, InvoiceService],
  exports: [ReservationsService, InvoiceService],
})
export class ReservationsModule {}
