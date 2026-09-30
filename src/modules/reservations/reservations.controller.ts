import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { QueryReservationsDto } from './dto/query-reservations.dto.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @ApiOperation({ summary: 'Membuat reservasi baru dan memproses check-in kamar' })
  @ApiResponse({ status: 201, description: 'Reservasi & check-in berhasil' })
  @ApiResponse({
    status: 400,
    description: 'Validasi form gagal atau format nomor identitas/telepon tidak sesuai',
  })
  @ApiResponse({
    status: 409,
    description: 'Kamar sudah occupied/tidak tersedia atau identitas tamu sedang aktif di kamar lain',
  })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: { id: string; role: string },
    @Ip() ip: string,
  ) {
    return this.reservationsService.createReservation(dto, user?.id, ip);
  }

  @ApiOperation({
    summary:
      'Daftar seluruh reservasi dengan pagination dan filter (Resepsionis dibatasi hari ini)',
  })
  @ApiResponse({ status: 200, description: 'Daftar reservasi berhasil diambil' })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Get()
  findAll(
    @Query() query: QueryReservationsDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.reservationsService.findAll(query, user);
  }

  @ApiOperation({ summary: 'Detail lengkap reservasi berdasarkan ID' })
  @ApiResponse({ status: 200, description: 'Detail reservasi ditemukan' })
  @ApiResponse({ status: 404, description: 'Reservasi tidak ditemukan' })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @ApiOperation({ summary: 'Proses check-out dan generate final PDF invoice' })
  @ApiResponse({ status: 200, description: 'Check-out berhasil, invoice diterbitkan' })
  @ApiResponse({ status: 404, description: 'Reservasi tidak ditemukan' })
  @ApiResponse({ status: 409, description: 'Reservasi sudah check-out sebelumnya' })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @Param('id') id: string,
    @Body() dto: CheckoutDto,
    @CurrentUser() user: { id: string; role: string },
    @Ip() ip: string,
  ) {
    return this.reservationsService.processCheckout(id, dto, user?.id, ip);
  }

  @ApiOperation({ summary: 'Ambil URL PDF invoice reservasi untuk cetak ulang' })
  @ApiResponse({ status: 200, description: 'URL PDF invoice berhasil didapatkan' })
  @ApiResponse({ status: 404, description: 'Reservasi tidak ditemukan' })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Get(':id/invoice')
  getInvoice(@Param('id') id: string) {
    return this.reservationsService.getInvoiceUrl(id);
  }
}
