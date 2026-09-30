import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { QueryRoomsDto } from './dto/query-rooms.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @ApiOperation({ summary: 'Daftar seluruh kamar hotel dengan filter' })
  @Get()
  findAll(@Query() query: QueryRoomsDto) {
    return this.roomsService.findAll(query);
  }

  @ApiOperation({ summary: 'Status ketersediaan grid kamar real-time (polling 15 detik)' })
  @Get('status')
  status() {
    return this.roomsService.findStatusOnly();
  }

  @ApiOperation({ summary: 'Detail kamar beserta info reservasi aktif jika ada' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @ApiOperation({ summary: 'Tambah unit kamar baru (Khusus Manager)' })
  @Roles('MANAGER')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateRoomDto,
    @CurrentUser() user: { id: string },
    @Ip() ip: string,
  ) {
    return this.roomsService.create(dto, user?.id, ip);
  }

  @ApiOperation({ summary: 'Tandai kamar DIRTY menjadi AVAILABLE setelah dibersihkan' })
  @Roles('RECEPTIONIST', 'MANAGER')
  @Patch(':id/mark-clean')
  markClean(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Ip() ip: string,
  ) {
    return this.roomsService.markClean(id, user?.id, ip);
  }

  @ApiOperation({ summary: 'Ubah informasi atau status kamar (Khusus Manager)' })
  @Roles('MANAGER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: { id: string },
    @Ip() ip: string,
  ) {
    return this.roomsService.update(id, dto, user?.id, ip);
  }

  @ApiOperation({ summary: 'Hapus kamar (Khusus Manager)' })
  @Roles('MANAGER')
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Ip() ip: string,
  ) {
    return this.roomsService.remove(id, user?.id, ip);
  }
}
