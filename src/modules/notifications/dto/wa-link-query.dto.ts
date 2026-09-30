import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum NotificationType {
  CHECKOUT_REMINDER = 'CHECKOUT_REMINDER',
  BOOKING_CONFIRMATION = 'BOOKING_CONFIRMATION',
  INVOICE = 'INVOICE',
}

export class WaLinkQueryDto {
  @ApiPropertyOptional({
    enum: NotificationType,
    default: NotificationType.CHECKOUT_REMINDER,
    description: 'Jenis template pesan WhatsApp yang akan di-generate',
  })
  @IsOptional()
  @IsEnum(NotificationType, {
    message:
      'type harus salah satu dari: CHECKOUT_REMINDER, BOOKING_CONFIRMATION, INVOICE',
  })
  type?: NotificationType = NotificationType.CHECKOUT_REMINDER;
}
