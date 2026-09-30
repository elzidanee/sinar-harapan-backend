import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CheckoutReminderScheduler } from './checkout-reminder.scheduler.js';
import { NotificationsController } from './notifications.controller.js';
import { WhatsappService } from './whatsapp.service.js';

@Module({
  imports: [HttpModule, PrismaModule, StorageModule],
  controllers: [NotificationsController],
  providers: [WhatsappService, CheckoutReminderScheduler],
  exports: [WhatsappService, CheckoutReminderScheduler],
})
export class NotificationsModule {}
