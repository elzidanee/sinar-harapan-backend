import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CheckoutReminderScheduler } from './checkout-reminder.scheduler.js';
import { SendReminderDto } from './dto/send-reminder.dto.js';
import { WaLinkQueryDto } from './dto/wa-link-query.dto.js';
import { WebhookDto } from './dto/webhook.dto.js';
import { WhatsappService } from './whatsapp.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly scheduler: CheckoutReminderScheduler,
  ) {}

  @ApiOperation({
    summary:
      'Generate WhatsApp Click-to-Chat Link (wa.me) dengan template otomatis (100% Gratis)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tautan wa.me dan pesan template berhasil di-generate',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECEPTIONIST', 'MANAGER')
  @Get('wa-link/:reservationId')
  generateWaLink(
    @Param('reservationId') reservationId: string,
    @Query() query: WaLinkQueryDto,
  ) {
    return this.whatsappService.generateWaLink(reservationId, query.type);
  }

  @ApiOperation({
    summary:
      'Tandai bahwa pengingat telah dikirim oleh resepsionis via tombol Click-to-Chat',
  })
  @ApiResponse({ status: 200, description: 'Status berhasil diperbarui' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECEPTIONIST', 'MANAGER')
  @Post('mark-sent/:reservationId')
  @HttpCode(HttpStatus.OK)
  markSent(@Param('reservationId') reservationId: string) {
    return this.whatsappService.markReminderSent(reservationId);
  }

  @ApiOperation({
    summary:
      'Trigger manual pengiriman pengingat check-out ke WhatsApp tamu (via Gateway / Mock)',
  })
  @ApiResponse({ status: 200, description: 'Pesan berhasil diproses' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('RECEPTIONIST', 'MANAGER')
  @Post('send-reminder')
  @HttpCode(HttpStatus.OK)
  sendReminder(@Body() dto: SendReminderDto) {
    return this.whatsappService.sendReminder(dto.reservationId);
  }

  @ApiOperation({
    summary:
      'Melihat status cron scheduler dan riwayat eksekusi pengingat otomatis (Khusus Manager)',
  })
  @ApiResponse({ status: 200, description: 'Status scheduler berhasil didapatkan' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @Get('scheduler-status')
  getSchedulerStatus() {
    return this.scheduler.getStatus();
  }

  @ApiOperation({
    summary: 'Callback Webhook dari WhatsApp Gateway Provider (Tanpa JWT Guard)',
  })
  @ApiResponse({ status: 200, description: 'Webhook berhasil diproses' })
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: WebhookDto,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    const isValid = this.whatsappService.verifyWebhookSignature(
      req.rawBody,
      signature,
    );
    if (!isValid) {
      throw new UnauthorizedException('Signature webhook tidak valid');
    }
    return this.whatsappService.handleWebhook(payload);
  }
}
