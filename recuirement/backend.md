# 🤖 backend.md
## Backend Implementation Spec — Sinar Harapan PMS (NestJS Edition)
### Ditulis untuk dikonsumsi oleh AI coding agent (Claude Code / agent sejenis)

---

> **CARA MEMBACA DOKUMEN INI (untuk agent):**
> Dokumen ini adalah sumber kebenaran tunggal (single source of truth) untuk implementasi backend.
> Backend ini dibangun dengan **NestJS**, BUKAN Next.js — revisi dari versi sebelumnya.
> Ikuti struktur module/controller/service/DTO PERSIS seperti yang tertulis di sini.
> Jika ada ambiguitas antara dokumen ini dan `endpoint.md`/`arsitektur.md`, **dokumen ini yang menang**
> untuk hal teknis implementasi, karena paling baru dan paling rinci untuk keperluan coding.
> Setiap bagian bisa dieksekusi secara independen sebagai satu task/todo item.
> `endpoint.md` tetap menjadi rujukan kontrak request/response per endpoint — dokumen ini fokus ke CARA membangunnya di NestJS.

---

## 0. Ringkasan Proyek

```yaml
nama_proyek: Sinar Harapan Frontdesk & Property Management System (PMS)
jenis: REST API backend untuk aplikasi hotel management
framework: NestJS (Express platform, bukan Fastify — untuk kompatibilitas library lebih luas)
bahasa: TypeScript (strict mode wajib aktif)
database: PostgreSQL via Supabase
orm: Prisma (via @nestjs custom PrismaModule)
autentikasi: JWT (@nestjs/jwt + Passport strategy)
validasi: class-validator + class-transformer (DTO-based)
dokumentasi_api: Swagger/OpenAPI auto-generate (@nestjs/swagger)
target_deploy: Railway atau Fly.io, region Singapore — proses long-running standar (BUKAN serverless)
konsumen_api: Aplikasi Flutter (web/desktop/tablet) — lihat design-system.md untuk konteks UI
dokumen_rujukan:
  - prd.md          # spesifikasi fitur & business rules
  - arsitektur.md   # arsitektur sistem level tinggi (catatan: bagian stack Next.js di sana sudah digantikan NestJS oleh dokumen ini)
  - endpoint.md     # kontrak API detail per endpoint (request/response body tetap berlaku)

catatan_migrasi: >
  Dokumen ini menggantikan versi backend.md sebelumnya yang berbasis Next.js App Router.
  Business logic (race condition handling, invoice generator, kalkulasi denda, dsb.) TIDAK berubah —
  hanya wadah arsitekturnya (Route Handler -> Controller/Service/Module NestJS).
```

---

## 1. Tech Stack & Versi yang Wajib Dipakai

| Layer | Teknologi | Versi Minimum | Catatan |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | — |
| Framework | NestJS | 10.x | Platform: Express (`@nestjs/platform-express`) |
| Bahasa | TypeScript | 5.x | `strict: true` di `tsconfig.json` |
| ORM | Prisma | 5.x | Dibungkus sebagai `PrismaModule` global NestJS |
| Database | PostgreSQL | 15+ | Hosted di Supabase |
| Validasi | class-validator + class-transformer | latest stable | Dipasang via `ValidationPipe` global |
| Auth | @nestjs/jwt + @nestjs/passport + passport-jwt | latest stable | HS256, bcrypt cost factor 10 |
| Password Hashing | bcrypt | latest stable | — |
| Cron | @nestjs/schedule | latest stable | `@Cron()` decorator, native di proses long-running |
| Dokumentasi API | @nestjs/swagger | latest stable | Auto-generate dari DTO + decorator controller |
| Excel Export | exceljs | latest stable | — |
| PDF Export | @react-pdf/renderer atau pdfkit | latest stable | — |
| HTTP Client (eksternal) | @nestjs/axios (wrapper axios) | latest stable | Untuk panggil Google Vision & WA Gateway |
| Testing | Jest + Supertest + @nestjs/testing | bawaan Nest CLI | — |
| Linting | ESLint + Prettier | bawaan Nest CLI | Config standar Nest + aturan tambahan §9 |
| Konfigurasi | @nestjs/config | latest stable | Validasi env via Joi/class-validator saat boot |

**Package manager:** `pnpm`.

**Inisialisasi project (perintah agent di tahap 0):**
```bash
pnpm dlx @nestjs/cli new sinar-harapan-backend --package-manager pnpm
cd sinar-harapan-backend
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt \
  @nestjs/schedule @nestjs/swagger @nestjs/axios axios \
  class-validator class-transformer bcrypt \
  @prisma/client exceljs
pnpm add -D prisma @types/passport-jwt @types/bcrypt
pnpm dlx prisma init
```

---

## 2. Environment Variables (`.env`)

Sama seperti sebelumnya, ditambah validasi wajib via `@nestjs/config` saat boot (§5.6).

```bash
# --- App ---
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000

# --- Database (Supabase Postgres) ---
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"
DIRECT_URL="postgresql://user:password@host:5432/dbname?schema=public"

# --- Auth ---
JWT_SECRET="ganti-dengan-random-string-minimal-32-karakter"
JWT_EXPIRES_IN="12h"
BCRYPT_SALT_ROUNDS=10

# --- Supabase Storage (foto dokumen identitas: KTP/Paspor/SIM) ---
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="xxxx"
SUPABASE_STORAGE_BUCKET="identity-documents"
SUPABASE_SIGNED_URL_EXPIRY_SECONDS=900

# --- Google Cloud Vision (OCR) ---
GOOGLE_CLOUD_PROJECT_ID="xxxx"
GOOGLE_APPLICATION_CREDENTIALS_JSON="{...service account json as string...}"
OCR_TIMEOUT_MS=3000

# --- WhatsApp Gateway (Fonnte/Wablas — pilih salah satu) ---
WA_PROVIDER="fonnte"          # atau "wablas"
WA_API_TOKEN="xxxx"
WA_API_BASE_URL="https://api.fonnte.com"
WA_WEBHOOK_SECRET="xxxx"      # untuk verifikasi signature callback

# --- Cron ---
CRON_CHECKOUT_REMINDER_ENABLED=true
CRON_TIMEZONE="Asia/Jakarta"

# --- Rate Limiting ---
LOGIN_RATE_LIMIT_MAX=5
LOGIN_RATE_LIMIT_WINDOW_MS=60000

# --- Swagger ---
SWAGGER_ENABLED=true
SWAGGER_PATH=api-docs
```

**Aturan agent:** setiap kali menambah integrasi baru, tambahkan variabelnya ke `.env.example`, tabel §2, DAN skema validasi di `src/config/env.validation.ts` (lihat §5.6).

---

## 3. Struktur Folder Wajib (Module-based, ala NestJS)

```
sinar-harapan-backend/
├── src/
│   ├── main.ts                              # Bootstrap: ValidationPipe, Swagger, CORS, global filters
│   ├── app.module.ts                        # Root module — import semua feature module
│   │
│   ├── config/
│   │   └── env.validation.ts                # Skema validasi environment variable saat boot
│   │
│   ├── common/                              # Cross-cutting concerns, dipakai lintas module
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts           # @Roles('MANAGER')
│   │   │   └── current-user.decorator.ts    # @CurrentUser() param decorator
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts            # Global guard — verifikasi JWT
│   │   │   └── roles.guard.ts               # RBAC guard — cek role vs @Roles()
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts     # Format error response konsisten
│   │   ├── interceptors/
│   │   │   ├── response.interceptor.ts      # Bungkus response sukses ke format standar
│   │   │   └── logging.interceptor.ts       # Log setiap request (untuk audit tambahan)
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts           # (opsional, jika perlu override default)
│   │   └── errors/
│   │       └── app.exception.ts             # class AppException custom (extends HttpException)
│   │
│   ├── prisma/
│   │   ├── prisma.module.ts                 # @Global() module
│   │   └── prisma.service.ts                # PrismaClient sebagai injectable provider
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   └── dto/
│   │   │       ├── login.dto.ts
│   │   │       └── refresh-token.dto.ts
│   │   │
│   │   ├── rooms/
│   │   │   ├── rooms.module.ts
│   │   │   ├── rooms.controller.ts
│   │   │   ├── rooms.service.ts
│   │   │   └── dto/
│   │   │       ├── create-room.dto.ts
│   │   │       ├── update-room.dto.ts
│   │   │       └── query-rooms.dto.ts
│   │   │
│   │   ├── ocr/
│   │   │   ├── ocr.module.ts
│   │   │   ├── ocr.controller.ts
│   │   │   └── ocr.service.ts
│   │   │
│   │   ├── reservations/
│   │   │   ├── reservations.module.ts
│   │   │   ├── reservations.controller.ts
│   │   │   ├── reservations.service.ts
│   │   │   ├── invoice.service.ts           # generator invoice number + PDF
│   │   │   └── dto/
│   │   │       ├── create-reservation.dto.ts
│   │   │       ├── checkout.dto.ts
│   │   │       └── query-reservations.dto.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── whatsapp.service.ts
│   │   │   └── checkout-reminder.scheduler.ts   # @Cron() job
│   │   │
│   │   ├── reports/
│   │   │   ├── reports.module.ts
│   │   │   ├── reports.controller.ts
│   │   │   └── reports.service.ts
│   │   │
│   │   ├── audit-logs/
│   │   │   ├── audit-logs.module.ts
│   │   │   ├── audit-logs.controller.ts
│   │   │   └── audit-logs.service.ts
│   │   │
│   │   ├── storage/
│   │   │   ├── storage.module.ts
│   │   │   └── storage.service.ts           # Supabase Storage upload + signed URL
│   │   │
│   │   └── health/
│   │       ├── health.module.ts
│   │       └── health.controller.ts
│   │
│   └── constants/
│       ├── roles.constant.ts
│       └── pricing.constant.ts              # tarif denda late checkout, dsb.
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│
├── test/
│   ├── unit/
│   └── e2e/                                 # Nest e2e test (setara integration test)
│
├── .env.example
├── .eslintrc.js
├── nest-cli.json
├── tsconfig.json
├── package.json
└── README.md
```

**Aturan agent:**
- Setiap **module** WAJIB punya `*.module.ts` yang mendaftarkan Controller + Provider (Service) miliknya sendiri, lalu di-import ke `app.module.ts`.
- **Controller HANYA berisi:** decorator route (`@Get`, `@Post`, dst.), decorator auth/role (`@UseGuards`, `@Roles`), binding DTO (`@Body()`, `@Query()`, `@Param()`), dan satu baris pemanggilan method service. **TIDAK ADA business logic di controller.**
- **Service adalah tempat SATU-SATUNYA untuk business logic.** Semua service yang butuh akses database inject `PrismaService` via constructor.
- **DTO adalah satu-satunya cara input divalidasi** — tidak ada validasi manual di dalam service untuk hal yang sudah bisa dicek DTO (format, tipe data, required field). Business rule (cek kamar tersedia, nomor identitas duplikat, dsb.) tetap di service karena butuh akses database.

---

## 4. Prisma Schema Lengkap (`prisma/schema.prisma`)

Tidak berubah dari versi sebelumnya — Prisma tetap ORM pilihan, independen dari framework HTTP di atasnya.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum UserRole {
  RECEPTIONIST
  MANAGER
}

enum RoomStatus {
  AVAILABLE
  OCCUPIED
  DIRTY
  MAINTENANCE
}

enum BookingSource {
  REDDOORZ
  WALK_IN
}

enum PaymentStatus {
  PAID
  PENDING
  CANCELLED
}

enum PaymentMethod {
  CASH
  QRIS
  TRANSFER
  REDDOORZ_PREPAID
}

enum WaDeliveryStatus {
  SENT
  DELIVERED
  READ
  FAILED
}

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  fullName     String   @map("full_name")
  role         UserRole
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  reservations Reservation[] @relation("ReceptionistReservations")
  activityLogs ActivityLog[]

  @@map("users")
}

model Room {
  id                 String     @id @default(uuid())
  roomNumber         String     @unique @map("room_number")
  roomType           String     @map("room_type")
  floor              Int
  basePricePerNight  Decimal    @map("base_price_per_night") @db.Decimal(12, 2)
  facilities         Json       @default("[]")
  status             RoomStatus @default(AVAILABLE)
  updatedAt          DateTime   @updatedAt @map("updated_at")
  createdAt          DateTime   @default(now()) @map("created_at")

  reservations Reservation[]

  @@index([status])
  @@index([roomType, floor])
  @@map("rooms")
}

enum IdentityType {
  KTP
  PASSPORT
  SIM
  OTHER
}

model Guest {
  id             String       @id @default(uuid())
  idType         IdentityType @map("id_type")
  idNumber       String       @map("id_number")
  fullName       String       @map("full_name")
  address        String?
  nationality    String?
  phoneWhatsapp  String       @map("phone_whatsapp")
  idImageUrl     String?      @map("id_image_url")
  createdAt      DateTime     @default(now()) @map("created_at")

  reservations Reservation[]

  @@unique([idType, idNumber])
  @@index([idType, idNumber])
  @@index([phoneWhatsapp])
  @@map("guests")
}

model Reservation {
  id                        String            @id @default(uuid())
  invoiceNumber              String            @unique @map("invoice_number")
  guestId                    String            @map("guest_id")
  guest                      Guest             @relation(fields: [guestId], references: [id])
  roomId                     String            @map("room_id")
  room                       Room              @relation(fields: [roomId], references: [id])
  bookingSource              BookingSource     @map("booking_source")
  reddoorzBookingCode        String?           @map("reddoorz_booking_code")
  checkInTime                DateTime          @map("check_in_time")
  expectedCheckOutTime       DateTime          @map("expected_check_out_time")
  actualCheckOutTime         DateTime?         @map("actual_check_out_time")
  totalNights                Int               @map("total_nights")
  roomRate                   Decimal           @map("room_rate") @db.Decimal(12, 2)
  additionalCharges          Decimal           @default(0) @map("additional_charges") @db.Decimal(12, 2)
  additionalChargesDetail    Json              @default("[]") @map("additional_charges_detail")
  totalAmount                Decimal           @map("total_amount") @db.Decimal(12, 2)
  paymentMethod              PaymentMethod     @map("payment_method")
  paymentStatus              PaymentStatus     @default(PAID) @map("payment_status")
  receptionistUserId         String?           @map("receptionist_user_id")
  receptionist                User?             @relation("ReceptionistReservations", fields: [receptionistUserId], references: [id])
  waReminderSentAt            DateTime?         @map("wa_reminder_sent_at")
  waDeliveryStatus             WaDeliveryStatus? @map("wa_delivery_status")
  createdAt                   DateTime          @default(now()) @map("created_at")
  updatedAt                   DateTime          @updatedAt @map("updated_at")

  @@index([roomId])
  @@index([guestId])
  @@index([checkInTime])
  @@index([expectedCheckOutTime])
  @@index([invoiceNumber])
  @@map("reservations")
}

model ActivityLog {
  id           String   @id @default(uuid())
  userId       String?  @map("user_id")
  user         User?    @relation(fields: [userId], references: [id])
  actionType   String   @map("action_type")
  resourceType String?  @map("resource_type")
  resourceId   String?  @map("resource_id")
  details      Json?
  ipAddress    String?  @map("ip_address")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([actionType])
  @@index([createdAt])
  @@map("activity_logs")
}
```

**Aturan agent:** setelah mengubah schema, jalankan `pnpm prisma migrate dev --name <nama_deskriptif>` lalu `pnpm prisma generate`. Jangan pernah mengedit database production secara manual di luar migration file.

---

## 5. Konvensi Kode NestJS (WAJIB DIIKUTI)

### 5.1 PrismaModule & PrismaService (Global Provider)

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```
`PrismaModule` diimpor SATU KALI di `app.module.ts`, karena `@Global()` — semua service lain cukup inject `PrismaService` di constructor tanpa import module lagi.

### 5.2 Pola Module–Controller–Service Standar

Contoh lengkap untuk module `rooms` sebagai referensi pola SEMUA module lain:

```typescript
// src/modules/rooms/dto/create-room.dto.ts
import { IsString, IsInt, IsNumber, IsPositive, IsIn, IsOptional, IsArray, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: '205' })
  @IsString()
  @MaxLength(10)
  roomNumber: string;

  @ApiProperty({ enum: ['Standard', 'Superior', 'Deluxe', 'Family'] })
  @IsIn(['Standard', 'Superior', 'Deluxe', 'Family'])
  roomType: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  floor: number;

  @ApiProperty({ example: 450000 })
  @IsNumber()
  @IsPositive()
  basePricePerNight: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  facilities?: string[];
}
```

```typescript
// src/modules/rooms/rooms.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomsDto } from './dto/query-rooms.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryRoomsDto) {
    return this.prisma.room.findMany({
      where: {
        roomType: query.roomType,
        floor: query.floor,
        status: query.status,
      },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { reservations: { where: { actualCheckOutTime: null }, take: 1 } },
    });
    if (!room) throw new NotFoundException('Kamar tidak ditemukan');
    return room;
  }

  async create(dto: CreateRoomDto) {
    const existing = await this.prisma.room.findUnique({ where: { roomNumber: dto.roomNumber } });
    if (existing) throw new ConflictException('Nomor kamar sudah terdaftar');
    return this.prisma.room.create({ data: dto });
  }

  async update(id: string, dto: UpdateRoomDto) {
    if (dto.status === 'MAINTENANCE') {
      const activeReservation = await this.prisma.reservation.findFirst({
        where: { roomId: id, actualCheckOutTime: null },
      });
      if (activeReservation) {
        throw new ConflictException('Kamar memiliki reservasi aktif, tidak dapat diubah ke MAINTENANCE');
      }
    }
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const activeReservation = await this.prisma.reservation.findFirst({
      where: { roomId: id, actualCheckOutTime: null },
    });
    if (activeReservation) {
      throw new ConflictException('Kamar memiliki riwayat reservasi aktif, tidak dapat dihapus');
    }
    return this.prisma.room.delete({ where: { id } });
  }
}
```

```typescript
// src/modules/rooms/rooms.controller.ts
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomsDto } from './dto/query-rooms.dto';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll(@Query() query: QueryRoomsDto) {
    return this.roomsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @Roles('MANAGER')
  create(@Body() dto: CreateRoomDto) {
    return this.roomsService.create(dto);
  }

  @Patch(':id')
  @Roles('MANAGER')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.roomsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('MANAGER')
  remove(@Param('id') id: string) {
    return this.roomsService.remove(id);
  }
}
```

```typescript
// src/modules/rooms/rooms.module.ts
import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService], // export jika module lain butuh (mis. ReservationsModule)
})
export class RoomsModule {}
```

**Catatan penting:** Controller TIDAK melempar `AppError` manual — cukup `throw new ConflictException(...)`, `NotFoundException(...)`, `BadRequestException(...)` dari `@nestjs/common`. NestJS otomatis mengubahnya jadi HTTP response dengan status code yang sesuai. Format akhir response distandarkan lewat `HttpExceptionFilter` dan `ResponseInterceptor` (lihat §5.3–5.4), agent TIDAK PERLU membungkus manual di setiap controller.

### 5.3 RBAC via Guards & Decorators

```typescript
// src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// src/common/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```typescript
// src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true; // tidak ada @Roles() = semua role login boleh akses

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} tidak memiliki akses ke resource ini`);
    }
    return true;
  }
}
```

```typescript
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user; // di-set oleh JwtStrategy setelah verifikasi token
});
```

**Pemakaian di controller:** `@UseGuards(JwtAuthGuard, RolesGuard)` di level Controller (berlaku untuk semua route di dalamnya), lalu `@Roles('MANAGER')` per-method untuk override yang butuh role spesifik. Endpoint publik (login, webhook, health) TIDAK memakai `@UseGuards(JwtAuthGuard)` sama sekali — dikecualikan secara eksplisit per-controller, BUKAN via global guard blanket (lihat §5.7 untuk keputusan ini).

### 5.4 Format Response Konsisten (Interceptor + Exception Filter)

```typescript
// src/common/interceptors/response.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: { timestamp: new Date().toISOString() },
      })),
    );
  }
}
```

```typescript
// src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message = typeof exceptionResponse === 'string'
      ? exceptionResponse
      : (exceptionResponse as any)?.message ?? 'Terjadi kesalahan pada server';

    const code = mapStatusToCode(status);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('[UNHANDLED_ERROR]', exception);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message: Array.isArray(message) ? message.join(', ') : message,
        ...(Array.isArray((exceptionResponse as any)?.message) && {
          fields: (exceptionResponse as any).message,
        }),
      },
    });
  }
}

function mapStatusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    429: 'RATE_LIMITED',
    502: 'EXTERNAL_SERVICE_ERROR',
    500: 'INTERNAL_ERROR',
  };
  return map[status] ?? 'INTERNAL_ERROR';
}
```

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // buang field yang tidak terdaftar di DTO
    forbidNonWhitelisted: true,
    transform: true,           // auto-convert tipe data (string query -> number, dsb.)
  }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' });

  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Sinar Harapan PMS API')
      .setDescription('Dokumentasi API — lihat juga endpoint.md untuk kontrak lengkap')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(process.env.SWAGGER_PATH ?? 'api-docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 5.5 AppException Custom (untuk kasus di luar HttpException bawaan)

Untuk sebagian besar kasus, gunakan exception bawaan NestJS (`ConflictException`, `NotFoundException`, `BadRequestException`, `ForbiddenException`, `UnauthorizedException`). Untuk kasus yang butuh `code` custom di luar mapping standar §5.4 (mis. `EXTERNAL_SERVICE_ERROR` dari OCR/WA gateway):

```typescript
// src/common/errors/app.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalServiceException extends HttpException {
  constructor(message: string) {
    super({ message, code: 'EXTERNAL_SERVICE_ERROR' }, HttpStatus.BAD_GATEWAY);
  }
}
```

### 5.6 Validasi Environment Variable saat Boot

```typescript
// src/config/env.validation.ts
import { plainToInstance } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString() DATABASE_URL: string;
  @IsString() JWT_SECRET: string;
  @IsString() SUPABASE_URL: string;
  @IsString() SUPABASE_SERVICE_ROLE_KEY: string;
  @IsString() WA_API_TOKEN: string;
  @IsString() WA_WEBHOOK_SECRET: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment variable tidak valid: ${errors.toString()}`);
  }
  return validated;
}
```
Didaftarkan di `ConfigModule.forRoot({ validate: validateEnv })` pada `app.module.ts` — aplikasi GAGAL start jika env wajib tidak lengkap (fail-fast, bukan error samar saat runtime).

### 5.7 Penamaan & Aturan Lain

| Elemen | Konvensi | Contoh |
|---|---|---|
| File module | `kebab-case.module.ts` | `reservations.module.ts` |
| File service | `kebab-case.service.ts` | `reservations.service.ts` |
| File controller | `kebab-case.controller.ts` | `reservations.controller.ts` |
| File DTO | `kebab-case.dto.ts` | `create-reservation.dto.ts` |
| Class | `PascalCase` + suffix sesuai jenis | `ReservationsService`, `CreateReservationDto` |
| Method service | `camelCase`, verb-first | `createReservation()`, `findAll()` |
| Konstanta | `UPPER_SNAKE_CASE` dari `src/constants/*.ts` | `ROLES.MANAGER` |

### 5.8 Larangan Eksplisit untuk Agent

- ❌ Jangan menulis query Prisma langsung di dalam controller — SELALU lewat service.
- ❌ Jangan bikin `AppError`/response envelope manual di controller — biarkan `ResponseInterceptor` dan `HttpExceptionFilter` yang menangani, cukup `throw` exception bawaan Nest.
- ❌ Jangan hardcode string role (`'MANAGER'`) berulang — gunakan `ROLES.MANAGER` dari `src/constants/roles.constant.ts`.
- ❌ Jangan menyimpan secret/API key di dalam kode — selalu dari `ConfigService`/`process.env`.
- ❌ Jangan skip decorator `class-validator` di DTO dengan alasan "field-nya sederhana".
- ❌ Jangan gunakan `any` di TypeScript kecuali benar-benar tidak terhindarkan (wajib beri komentar alasan).
- ❌ Jangan pasang `JwtAuthGuard` secara global (`app.useGlobalGuards()`) — pasang eksplisit per-Controller via `@UseGuards()`, supaya endpoint publik (`auth/login`, `notifications/webhook`, `health`) jelas terlihat TIDAK memakainya tanpa perlu daftar pengecualian tersembunyi.

---

## 6. Urutan Implementasi (Checklist Bertahap untuk Agent)

Ikuti urutan ini — setiap tahap harus lolos build & test sebelum lanjut ke tahap berikutnya.

### Tahap 0 — Bootstrap Project
- [ ] `nest new` project, pilih pnpm sebagai package manager
- [ ] Install dependency sesuai §1
- [ ] Setup `PrismaModule`/`PrismaService` (§5.1), jalankan migration awal dari schema §4
- [ ] Setup `ConfigModule.forRoot({ validate: validateEnv, isGlobal: true })` (§5.6)
- [ ] Setup `ValidationPipe`, `HttpExceptionFilter`, `ResponseInterceptor` global di `main.ts` (§5.4)
- [ ] Setup Swagger (§5.4)
- [ ] Buat `HealthModule` dengan `GET /health` — pastikan bisa `curl` dan return `200`

### Tahap 1 — Auth & RBAC
- [ ] Buat `AuthModule`: `AuthService` (bcrypt hash/compare, generate JWT via `JwtService`), `AuthController`
- [ ] Buat `JwtStrategy` (`@nestjs/passport`) — decode token, set `request.user`
- [ ] Buat `JwtAuthGuard`, `RolesGuard`, `@Roles()` decorator, `@CurrentUser()` decorator (§5.3)
- [ ] Implementasi `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` — TANPA `@UseGuards(JwtAuthGuard)` pada `login` (publik), lainnya pakai guard
- [ ] Buat `prisma/seed.ts` — 1 user MANAGER, 1 user RECEPTIONIST untuk testing
- [ ] Unit test (`@nestjs/testing`, mock `PrismaService`): login sukses, login gagal (password salah)
- [ ] E2E test: akses endpoint ber-guard tanpa token → 401; dengan role salah → 403

### Tahap 2 — Room Management
- [ ] Buat `RoomsModule` lengkap (Controller, Service, DTO) mengikuti pola §5.2 PERSIS
- [ ] Implementasi seluruh route sesuai `endpoint.md` §3
- [ ] **Business rule kritis:** `update()` menolak `MAINTENANCE` jika ada reservasi aktif; `remove()` menolak jika ada reservasi aktif
- [ ] E2E test: CRUD kamar oleh MANAGER sukses, oleh RECEPTIONIST ditolak 403

### Tahap 3 — OCR Integration (Multi Jenis Dokumen: KTP/Paspor/SIM)
- [ ] Buat `StorageModule`/`StorageService`: upload ke Supabase Storage via REST API (pakai `HttpService` dari `@nestjs/axios`), generate signed URL
- [ ] Buat `OcrModule`/`OcrService`: kirim gambar ke Google Cloud Vision API, lalu **dispatch parser berdasarkan `documentType`** yang dikirim client — `parseKtpText()`, `parsePassportMrz()`, atau `parseSimText()` (lihat §8.3, tiga parser berbeda karena struktur dokumen beda total)
- [ ] Implementasi `POST /ocr/extract-identity` (`FileInterceptor` dari `@nestjs/platform-express` untuk terima multipart upload + field `documentType`), timeout 3 detik via `timeout()` operator RxJS pada request axios
- [ ] Unit test: parsing teks OCR dummy untuk **ketiga jenis dokumen** → hasil field sesuai ekspektasi masing-masing (KTP: NIK/Nama/Alamat; Paspor: nomor paspor/nama/kewarganegaraan dari MRZ; SIM: nomor SIM/nama)
- [ ] Test manual: OCR service down → lempar `ExternalServiceException` (§5.5) → response `502 EXTERNAL_SERVICE_ERROR`
- [ ] Test manual: `documentType` tidak dikenali (bukan KTP/PASSPORT/SIM/OTHER) → `400 VALIDATION_ERROR`

### Tahap 4 — Reservation & Check-in
- [ ] Buat `InvoiceService` di dalam `ReservationsModule`: `generateInvoiceNumber()` (§8.4)
- [ ] Buat `ReservationsService.createReservation()` — **WAJIB pakai `prisma.$transaction()` + row lock** (§8.2, logic sama, dibungkus method service)
- [ ] DTO `CreateReservationDto` dengan validasi nomor identitas sesuai `idType` (KTP 16 digit, Paspor/SIM alfanumerik) & format WA (§8.1)
- [ ] Implementasi `POST /reservations`, `GET /reservations`, `GET /reservations/:id`
- [ ] **Business rule kritis:** cek nomor identitas (kombinasi `idType`+`idNumber`) tidak sedang aktif check-in di kamar lain (§8.5)
- [ ] E2E test: dua request check-in bersamaan ke kamar sama → hanya satu sukses, satunya `409 CONFLICT`

### Tahap 5 — Check-out & Invoice
- [ ] Extend `ReservationsService`: `processCheckout()` (§8.6, kalkulasi denda late checkout)
- [ ] Generate PDF invoice, simpan ke storage via `StorageService`, kembalikan URL
- [ ] Implementasi `POST /reservations/:id/checkout`, `GET /reservations/:id/invoice`, `PATCH /rooms/:id/mark-clean`
- [ ] E2E test: checkout sukses → status kamar `DIRTY`, invoice number sesuai format

### Tahap 6 — WhatsApp Gateway & Cron
- [ ] Buat `NotificationsModule`: `WhatsappService.sendReminder()`, render template dari `prd.md` §3.4
- [ ] Implementasi `POST /notifications/send-reminder`
- [ ] Implementasi `POST /notifications/webhook` — controller TANPA `JwtAuthGuard`, verifikasi signature manual di dalam method (§8.7)
- [ ] Buat `CheckoutReminderScheduler` pakai `@Cron('*/10 * * * *')` dari `@nestjs/schedule` — daftarkan `ScheduleModule.forRoot()` di `app.module.ts`
- [ ] Unit test: query cron mengambil reservasi yang tepat (edge case: sudah dikirim sebelumnya → tidak dikirim ulang)

### Tahap 7 — Reporting & Audit
- [ ] Buat `ReportsModule`: `getSummary()`, `getTransactions()`, `exportExcel()`, `exportPdf()` — seluruh controller pakai `@Roles('MANAGER')`
- [ ] Untuk file binary (Excel/PDF), gunakan `@Res({ passthrough: false })` Express response langsung (bypass `ResponseInterceptor` karena ini bukan JSON) — set header `Content-Type` & `Content-Disposition` manual
- [ ] Buat `AuditLogsModule` + helper `ActivityLogService.log()` yang di-inject ke service lain yang butuh (§8.8)
- [ ] Implementasi `GET /audit-logs`
- [ ] E2E test: RECEPTIONIST akses endpoint report → 403; export tercatat di activity_logs

### Tahap 8 — Hardening & QA
- [ ] Rate limiting via `@nestjs/throttler` di `POST /auth/login` (§2, `LOGIN_RATE_LIMIT_*`)
- [ ] Review seluruh controller terhadap matriks RBAC di `prd.md` §2.3 — buat test otomatis yang memverifikasi setiap kombinasi role x endpoint
- [ ] Load test dasar (k6/Artillery) untuk endpoint check-in & room grid
- [ ] Security review: pastikan tidak ada nomor identitas (NIK/Paspor/SIM)/foto dokumen muncul di log aplikasi (cek `LoggingInterceptor` tidak log body request OCR/reservation mentah)
- [ ] Pastikan Swagger di production di-nonaktifkan atau dilindungi auth (`SWAGGER_ENABLED=false` di env production, atau tambahkan Basic Auth di depan path Swagger)

---

## 7. Kontrak API Ringkas (Quick Reference)

> Detail lengkap request/response body ada di `endpoint.md`. Tabel ini referensi cepat mapping ke Controller/Service NestJS.

| Method | Path | Role | Controller.Method | Service.Method |
|---|---|---|---|---|
| POST | `/auth/login` | Public | `AuthController.login` | `AuthService.login()` |
| POST | `/auth/refresh` | Any | `AuthController.refresh` | `AuthService.refresh()` |
| GET | `/rooms` | Any | `RoomsController.findAll` | `RoomsService.findAll()` |
| GET | `/rooms/status` | Any | `RoomsController.status` | `RoomsService.findStatusOnly()` |
| GET | `/rooms/:id` | Any | `RoomsController.findOne` | `RoomsService.findOne()` |
| POST | `/rooms` | Manager | `RoomsController.create` | `RoomsService.create()` |
| PATCH | `/rooms/:id` | Manager | `RoomsController.update` | `RoomsService.update()` |
| DELETE | `/rooms/:id` | Manager | `RoomsController.remove` | `RoomsService.remove()` |
| PATCH | `/rooms/:id/mark-clean` | Receptionist | `RoomsController.markClean` | `RoomsService.markClean()` |
| POST | `/ocr/extract-identity` | Receptionist | `OcrController.extractIdentity` | `OcrService.extractIdentity()` |
| POST | `/reservations` | Receptionist | `ReservationsController.create` | `ReservationsService.createReservation()` |
| GET | `/reservations` | Any | `ReservationsController.findAll` | `ReservationsService.findAll()` |
| GET | `/reservations/:id` | Any | `ReservationsController.findOne` | `ReservationsService.findOne()` |
| POST | `/reservations/:id/checkout` | Receptionist | `ReservationsController.checkout` | `ReservationsService.processCheckout()` |
| GET | `/reservations/:id/invoice` | Any | `ReservationsController.getInvoice` | `ReservationsService.getInvoiceUrl()` |
| POST | `/notifications/send-reminder` | Receptionist | `NotificationsController.sendReminder` | `WhatsappService.sendReminder()` |
| POST | `/notifications/webhook` | Provider secret | `NotificationsController.webhook` | `WhatsappService.handleWebhook()` |
| GET | `/notifications/scheduler-status` | Manager | `NotificationsController.schedulerStatus` | `CheckoutReminderScheduler.getRunHistory()` |
| GET | `/reports/summary` | Manager | `ReportsController.summary` | `ReportsService.getSummary()` |
| GET | `/reports/transactions` | Manager | `ReportsController.transactions` | `ReportsService.getTransactions()` |
| GET | `/reports/export-excel` | Manager | `ReportsController.exportExcel` | `ReportsService.exportExcel()` |
| GET | `/reports/export-pdf` | Manager | `ReportsController.exportPdf` | `ReportsService.exportPdf()` |
| GET | `/audit-logs` | Manager | `AuditLogsController.findAll` | `AuditLogsService.findAll()` |
| GET | `/health` | Public | `HealthController.check` | — |

---

## 8. Business Logic Kritis (WAJIB Diimplementasikan Persis)

> Logic di bawah ini SAMA persis dengan versi Next.js sebelumnya — hanya dibungkus sebagai method di dalam `@Injectable()` Service NestJS, dengan `PrismaService` yang di-inject via constructor alih-alih import singleton.

### 8.1 Validasi Input Utama (via class-validator DTO)

Karena format nomor identitas berbeda-beda per jenis dokumen (NIK KTP selalu 16 digit angka,
nomor Paspor Indonesia berpola 1 huruf + 7 digit tapi paspor asing bervariasi, SIM punya pola
sendiri), validasi format TIDAK bisa memakai satu `@Matches()` statis — dibuat custom validator
yang membaca `idType` dari sibling field:

```typescript
// src/modules/reservations/dto/validators/id-number-format.validator.ts
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'IdNumberFormat', async: false })
export class IdNumberFormatValidator implements ValidatorConstraintInterface {
  validate(idNumber: string, args: ValidationArguments) {
    const obj = args.object as any;
    switch (obj.idType) {
      case 'KTP':
        return /^\d{16}$/.test(idNumber); // NIK selalu 16 digit angka
      case 'SIM':
        return /^\d{12,16}$/.test(idNumber); // SIM Indonesia umumnya 12-16 digit
      case 'PASSPORT':
        return /^[A-Za-z0-9]{6,9}$/.test(idNumber); // Format internasional bervariasi, dilonggarkan
      case 'OTHER':
        return idNumber.length >= 4 && idNumber.length <= 30; // Longgar untuk dokumen lain
      default:
        return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    return `Format nomor identitas tidak valid untuk jenis dokumen ${obj.idType}`;
  }
}
```

```typescript
// src/modules/reservations/dto/create-reservation.dto.ts
import { IsUUID, IsEnum, IsOptional, IsString, Matches, ValidateNested, IsDateString, IsInt, IsPositive, IsNumber, Validate } from 'class-validator';
import { Type } from 'class-transformer';
import { IdNumberFormatValidator } from './validators/id-number-format.validator';

class GuestDto {
  @IsEnum(['KTP', 'PASSPORT', 'SIM', 'OTHER'])
  idType: 'KTP' | 'PASSPORT' | 'SIM' | 'OTHER';

  @IsString()
  @Validate(IdNumberFormatValidator)
  idNumber: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  nationality?: string; // terutama diisi untuk PASSPORT, dari hasil parsing MRZ (§8.3)

  @Matches(/^(\+62|08)\d{8,13}$/, { message: 'Format nomor WA tidak valid' })
  phoneWhatsapp: string;

  @IsOptional()
  @IsString()
  idImageUrl?: string;
}

export class CreateReservationDto {
  @IsUUID()
  roomId: string;

  @IsEnum(['REDDOORZ', 'WALK_IN'])
  bookingSource: 'REDDOORZ' | 'WALK_IN';

  @IsOptional()
  @IsString()
  reddoorzBookingCode?: string;

  @ValidateNested()
  @Type(() => GuestDto)
  guest: GuestDto;

  @IsDateString()
  checkInTime: string;

  @IsDateString()
  expectedCheckOutTime: string;

  @IsInt()
  @IsPositive()
  totalNights: number;

  @IsNumber()
  @IsPositive()
  roomRate: number;

  @IsEnum(['CASH', 'QRIS', 'TRANSFER', 'REDDOORZ_PREPAID'])
  paymentMethod: string;
}
```
**Catatan:** validasi silang "`reddoorzBookingCode` wajib jika `bookingSource === REDDOORZ`" tidak bisa murni via decorator per-field — implementasikan sebagai custom `@ValidatorConstraint` ATAU cek tambahan di awal `ReservationsService.createReservation()` sebelum masuk transaction.

### 8.2 Mencegah Race Condition Check-in (KRITIS)

```typescript
// src/modules/reservations/reservations.service.ts
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceService } from './invoice.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async createReservation(dto: CreateReservationDto, receptionistId: string) {
    if (dto.bookingSource === 'REDDOORZ' && !dto.reddoorzBookingCode) {
      throw new ConflictException('reddoorzBookingCode wajib diisi untuk booking REDDOORZ');
    }

    return this.prisma.$transaction(async (tx) => {
      // Row lock via raw query FOR UPDATE
      const rooms = await tx.$queryRaw<any[]>`SELECT * FROM rooms WHERE id = ${dto.roomId} FOR UPDATE`;
      const room = rooms[0];
      if (!room || room.status !== 'AVAILABLE') {
        throw new ConflictException('Kamar sudah tidak tersedia');
      }

      const activeReservation = await tx.reservation.findFirst({
        where: {
          guest: { idType: dto.guest.idType, idNumber: dto.guest.idNumber },
          actualCheckOutTime: null,
        },
      });
      if (activeReservation) {
        throw new ConflictException(
          `Nomor ${dto.guest.idType} ini sedang aktif check-in di kamar lain`,
        );
      }

      const guest = await tx.guest.upsert({
        where: { idType_idNumber: { idType: dto.guest.idType, idNumber: dto.guest.idNumber } },
        update: {
          fullName: dto.guest.fullName,
          phoneWhatsapp: dto.guest.phoneWhatsapp,
          nationality: dto.guest.nationality,
        },
        create: { ...dto.guest },
      });

      const invoiceNumber = await this.invoiceService.generateInvoiceNumber(tx);

      const reservation = await tx.reservation.create({
        data: {
          invoiceNumber,
          guestId: guest.id,
          roomId: dto.roomId,
          bookingSource: dto.bookingSource,
          reddoorzBookingCode: dto.reddoorzBookingCode,
          checkInTime: dto.checkInTime,
          expectedCheckOutTime: dto.expectedCheckOutTime,
          totalNights: dto.totalNights,
          roomRate: dto.roomRate,
          totalAmount: dto.totalNights * dto.roomRate,
          paymentMethod: dto.paymentMethod as any,
          receptionistUserId: receptionistId,
        },
      });

      await tx.room.update({ where: { id: dto.roomId }, data: { status: 'OCCUPIED' } });

      return reservation;
    });
  }
}
```
**Kenapa `FOR UPDATE`:** tanpa row lock, dua request bersamaan bisa sama-sama lolos cek `status === AVAILABLE` sebelum salah satu meng-update status, menyebabkan double booking. `ConflictException` yang dilempar di dalam `$transaction()` otomatis membatalkan (rollback) seluruh perubahan pada percobaan yang gagal.

### 8.3 Parsing OCR Multi Jenis Dokumen (KTP, Paspor, SIM)

> **Kenapa perlu 3 parser berbeda, bukan satu regex generik:** KTP dan SIM Indonesia adalah teks
> bebas dengan label field (`Nama:`, `Alamat:`, dst.) sehingga cocok di-parsing dengan regex
> berbasis label. Paspor internasional TIDAK punya label semacam itu — data terstruktur diambil
> dari **MRZ (Machine Readable Zone)**, dua/tiga baris teks berformat tetap (fixed-width) di
> bagian bawah halaman biodata paspor, jauh lebih presisi diparsing lewat posisi karakter
> daripada regex label. Client (Flutter) WAJIB mengirim `documentType` supaya backend tahu
> parser mana yang dipakai — OCR generik Google Vision tidak otomatis mendeteksi jenis dokumen.

```typescript
// src/modules/ocr/ocr.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ExternalServiceException } from '../../common/errors/app.exception';
import { timeout, catchError } from 'rxjs/operators';
import { firstValueFrom, throwError } from 'rxjs';

export type DocumentType = 'KTP' | 'PASSPORT' | 'SIM';

@Injectable()
export class OcrService {
  constructor(private readonly httpService: HttpService) {}

  async extractIdentity(imageBuffer: Buffer, documentType: DocumentType) {
    const rawText = await this.callGoogleVision(imageBuffer);

    switch (documentType) {
      case 'KTP':
        return this.parseKtpText(rawText);
      case 'SIM':
        return this.parseSimText(rawText);
      case 'PASSPORT':
        return this.parsePassportMrz(rawText);
      default:
        throw new BadRequestException(`documentType tidak dikenali: ${documentType}`);
    }
  }

  private async callGoogleVision(imageBuffer: Buffer): Promise<string> {
    const request$ = this.httpService.post(/* endpoint Google Vision */ '', {
      /* payload sesuai dokumentasi Google Vision Document Text Detection */
    }).pipe(
      timeout(Number(process.env.OCR_TIMEOUT_MS ?? 3000)),
      catchError((err) => throwError(() => new ExternalServiceException('Layanan OCR tidak merespons, gunakan input manual'))),
    );
    const response = await firstValueFrom(request$);
    return response.data.text ?? '';
  }

  // --- Parser 1: KTP (regex berbasis label) ---
  private parseKtpText(rawText: string) {
    const nikMatch = rawText.match(/\b\d{16}\b/);
    const namaMatch = rawText.match(/Nama\s*[:\-]?\s*([A-Z\s]+)/i);
    const alamatMatch = rawText.match(/Alamat\s*[:\-]?\s*([A-Za-z0-9\s.,\/]+)/i);

    const parsed = {
      idType: 'KTP' as const,
      idNumber: nikMatch?.[0] ?? null,
      namaLengkap: namaMatch?.[1]?.trim() ?? null,
      alamat: alamatMatch?.[1]?.trim() ?? null,
      nationality: 'Indonesia', // KTP selalu WNI
    };

    const fieldsFound = [parsed.idNumber, parsed.namaLengkap, parsed.alamat].filter(Boolean).length;
    const confidence = fieldsFound / 3;
    return { ...parsed, confidence, perluVerifikasiManual: confidence < 0.7 };
  }

  // --- Parser 2: SIM (mirip KTP, label field sedikit berbeda + ada golongan SIM) ---
  private parseSimText(rawText: string) {
    const noSimMatch = rawText.match(/\b\d{12,16}\b/); // Nomor SIM Indonesia 12-16 digit
    const namaMatch = rawText.match(/Nama\s*[:\-]?\s*([A-Z\s]+)/i);
    const golonganMatch = rawText.match(/\b(SIM\s?[ABC][I]?)\b/i);

    const parsed = {
      idType: 'SIM' as const,
      idNumber: noSimMatch?.[0] ?? null,
      namaLengkap: namaMatch?.[1]?.trim() ?? null,
      alamat: null as string | null, // SIM Indonesia umumnya tidak mencantumkan alamat lengkap
      nationality: 'Indonesia',
      golonganSim: golonganMatch?.[0] ?? null, // info tambahan, tidak wajib dipakai di form
    };

    const fieldsFound = [parsed.idNumber, parsed.namaLengkap].filter(Boolean).length;
    const confidence = fieldsFound / 2;
    return { ...parsed, confidence, perluVerifikasiManual: confidence < 0.7 };
  }

  // --- Parser 3: Paspor (parsing MRZ, BUKAN regex label) ---
  // MRZ baris ke-2 (contoh format): P<IDNXXXXXXX<7IDN9001019M3001015<<<<<<<<<<<<<<02
  // Posisi karakter TETAP (fixed-width), tidak berubah antar negara penerbit (standar ICAO 9303)
  private parsePassportMrz(rawText: string) {
    // Cari 2 baris MRZ (masing-masing 44 karakter, biasanya diawali "P<" untuk baris pertama)
    const lines = rawText.split('\n').map((l) => l.trim());
    const mrzLine1 = lines.find((l) => /^P[A-Z<]/.test(l) && l.length >= 40);
    const mrzLine2Index = mrzLine1 ? lines.indexOf(mrzLine1) + 1 : -1;
    const mrzLine2 = mrzLine2Index >= 0 ? lines[mrzLine2Index] : null;

    if (!mrzLine1 || !mrzLine2) {
      // MRZ tidak terbaca sama sekali — kembalikan confidence 0, WAJIB isi manual
      return {
        idType: 'PASSPORT' as const,
        idNumber: null,
        namaLengkap: null,
        alamat: null,
        nationality: null,
        confidence: 0,
        perluVerifikasiManual: true,
      };
    }

    // Baris 1: P<COUNTRYCODE<SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<<<<<<<<
    const namePart = mrzLine1.substring(5).replace(/</g, ' ').trim();

    // Baris 2, posisi karakter tetap sesuai ICAO 9303:
    const passportNumber = mrzLine2.substring(0, 9).replace(/</g, '').trim();
    const nationalityCode = mrzLine2.substring(10, 13).replace(/</g, '').trim();

    const parsed = {
      idType: 'PASSPORT' as const,
      idNumber: passportNumber || null,
      namaLengkap: namePart || null,
      alamat: null, // paspor tidak mencantumkan alamat
      nationality: nationalityCode || null, // kode 3 huruf ICAO, mis. "IDN" — mapping ke nama negara di frontend/service terpisah jika perlu ditampilkan
    };

    const fieldsFound = [parsed.idNumber, parsed.namaLengkap, parsed.nationality].filter(Boolean).length;
    const confidence = fieldsFound / 3;
    return { ...parsed, confidence, perluVerifikasiManual: confidence < 0.7 };
  }
}
```
**Catatan implementasi MRZ:** parsing di atas adalah versi sederhana untuk cakupan field inti
(nomor paspor, nama, kewarganegaraan). ICAO 9303 juga mendefinisikan check digit tervalidasi
matematis (modulo 10) di posisi tertentu — menambahkan validasi check digit adalah peningkatan
akurasi opsional untuk pasca-MVP, TIDAK wajib di rilis awal karena `perluVerifikasiManual` sudah
menjadi jaring pengaman kalau parsing meleset.

### 8.4 Generator Nomor Invoice

```typescript
// src/modules/reservations/invoice.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceService {
  async generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
    const today = new Date();
    const datePart = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const countToday = await tx.reservation.count({
      where: { invoiceNumber: { startsWith: `INV/SH/${datePart}/` } },
    });

    const sequence = String(countToday + 1).padStart(4, '0');
    return `INV/SH/${datePart}/${sequence}`;
  }
}
```
**Catatan:** dipanggil di dalam transaction yang sama dengan `FOR UPDATE` pada room sehingga risiko race condition pada sequence sangat kecil. `UNIQUE constraint` di `invoiceNumber` (§4) tetap jadi safety net — jika terjadi collision, tangkap Prisma error `P2002` (unique constraint violation) di `ReservationsService` dan retry generate sequence berikutnya.

### 8.5 Validasi Anti-Duplikasi Nomor Identitas Aktif

Sudah termasuk dalam §8.2 — query `findFirst` dengan kondisi `actualCheckOutTime: null` pada kombinasi `idType` + `idNumber` yang sama SEBELUM membuat reservasi baru, di dalam transaction yang sama. Nomor yang sama dari jenis dokumen berbeda (mis. NIK KTP "1234..." vs nomor Paspor "1234...") dianggap sebagai identitas yang BERBEDA — lihat constraint gabungan di `database.md` §2.3.

### 8.6 Kalkulasi Denda Late Check-out

```typescript
// src/modules/reservations/reservations.service.ts (lanjutan)
import { PRICING } from '../../constants/pricing.constant';

async processCheckout(reservationId: string, dto: CheckoutDto) {
  const reservation = await this.prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

  if (reservation.actualCheckOutTime) {
    throw new ConflictException('Reservasi ini sudah checkout sebelumnya');
  }

  const actualCheckOut = new Date(dto.actualCheckOutTime);
  const expectedCheckOut = reservation.expectedCheckOutTime;

  let lateFee = 0;
  if (actualCheckOut > expectedCheckOut) {
    const lateHours = Math.ceil((actualCheckOut.getTime() - expectedCheckOut.getTime()) / (1000 * 60 * 60));
    const hourlyRate = Number(reservation.roomRate) * PRICING.LATE_CHECKOUT_RATE_PER_HOUR;
    lateFee = lateHours * hourlyRate;
  }

  const additionalChargesTotal =
    dto.additionalCharges.reduce((sum, c) => sum + c.amount, 0) + lateFee;

  const totalAmount = Number(reservation.roomRate) * reservation.totalNights + additionalChargesTotal;

  const updated = await this.prisma.reservation.update({
    where: { id: reservationId },
    data: {
      actualCheckOutTime: actualCheckOut,
      additionalCharges: additionalChargesTotal,
      additionalChargesDetail: [...dto.additionalCharges, ...(lateFee > 0 ? [{ label: 'Denda Late Check-out', amount: lateFee }] : [])],
      totalAmount,
    },
  });

  await this.prisma.room.update({ where: { id: reservation.roomId }, data: { status: 'DIRTY' } });

  // ...generate invoice PDF via InvoiceService, upload via StorageService
  return updated;
}
```
```typescript
// src/constants/pricing.constant.ts
export const PRICING = {
  LATE_CHECKOUT_RATE_PER_HOUR: 0.1, // 10% dari room rate per jam keterlambatan — konfirmasi ke klien saat UAT
};
```
**Catatan:** JANGAN hardcode angka `0.1` langsung di dalam service — selalu lewat konstanta ini agar mudah diubah tanpa menyentuh business logic.

### 8.7 Verifikasi Webhook WhatsApp (BUKAN via JwtAuthGuard)

```typescript
// src/modules/notifications/notifications.controller.ts
import { Controller, Post, Body, Headers, UnauthorizedException, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { WhatsappService } from './whatsapp.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // TIDAK ADA @UseGuards(JwtAuthGuard) di sini — verifikasi signature manual
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-webhook-signature') signature: string) {
    const isValid = this.whatsappService.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) {
      throw new UnauthorizedException('Signature tidak valid');
    }
    return this.whatsappService.handleWebhook(req.body);
  }
}
```
**PENTING:** aktifkan `rawBody: true` saat `NestFactory.create(AppModule, { rawBody: true })` di `main.ts` agar `req.rawBody` tersedia untuk verifikasi HMAC signature.

### 8.8 Daftar Aksi yang WAJIB Dicatat ke `activity_logs`

| Action Type | Trigger |
|---|---|
| `CHECK_IN` | Setelah `ReservationsService.createReservation()` sukses |
| `CHECK_OUT` | Setelah `ReservationsService.processCheckout()` sukses |
| `CREATE_ROOM` | Setelah `RoomsService.create()` sukses |
| `EDIT_PRICE` | Setelah `RoomsService.update()` mengubah `basePricePerNight` |
| `EDIT_ROOM_STATUS` | Setelah `RoomsService.update()` mengubah `status` |
| `DELETE_ROOM` | Setelah `RoomsService.remove()` sukses |
| `EXPORT_REPORT` | Setiap kali `ReportsService.exportExcel()`/`exportPdf()` dipanggil |
| `WA_REMINDER_FAILED` | Saat `CheckoutReminderScheduler` gagal kirim WA setelah retry maksimum |
| `LOGIN_FAILED` | Setiap percobaan login gagal (deteksi brute-force) |

Implementasi sebagai injectable service terpisah agar bisa di-inject ke module manapun:

```typescript
// src/modules/audit-logs/audit-logs.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    actionType: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    return this.prisma.activityLog.create({ data: params });
  }

  async findAll(query: { userId?: string; actionType?: string; startDate?: string; endDate?: string }) {
    return this.prisma.activityLog.findMany({
      where: {
        userId: query.userId,
        actionType: query.actionType,
        createdAt: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined },
      },
      include: { user: { select: { fullName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```
Module lain yang butuh logging harus import `AuditLogsModule` (dengan `AuditLogsService` di-export) dan inject `AuditLogsService` via constructor.

---

## 9. Testing Requirements

### 9.1 Cakupan Minimum

| Layer | Target Coverage | Fokus |
|---|---|---|
| `*.service.ts` | ≥ 80% | Business logic, terutama §8 — test via `Test.createTestingModule()` dengan mock `PrismaService` |
| `*.controller.ts` (e2e) | Setiap endpoint | Status code, format response, RBAC — pakai `supertest` terhadap instance Nest app penuh |
| DTO (`class-validator`) | 100% untuk kasus valid & invalid utama | Bisa test langsung via `validate()` dari `class-validator` |

### 9.2 Contoh Pola Unit Test Service (Nest Testing Module)

```typescript
// test/unit/rooms.service.spec.ts
import { Test } from '@nestjs/testing';
import { RoomsService } from '../../src/modules/rooms/rooms.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: { room: any; reservation: any };

  beforeEach(async () => {
    prisma = {
      room: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      reservation: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [RoomsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(RoomsService);
  });

  it('menolak set MAINTENANCE jika ada reservasi aktif', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ id: 'res-1' });
    await expect(service.update('room-1', { status: 'MAINTENANCE' } as any))
      .rejects.toThrow(ConflictException);
  });
});
```

### 9.3 Skenario Test Wajib (Non-Negotiable)

```
✅ Login dengan kredensial benar → token diterbitkan
✅ Login dengan kredensial salah → 401
✅ Akses endpoint MANAGER-only dengan role RECEPTIONIST → 403
✅ Dua request check-in bersamaan ke kamar sama → satu sukses, satu 409
✅ Check-in dengan nomor identitas (KTP/Paspor/SIM) yang sedang aktif di kamar lain → 409
✅ Check-in dengan nomor identitas SAMA tapi idType BERBEDA (mis. KTP vs Paspor) → dianggap
   tamu berbeda, TIDAK ditolak 409
✅ OCR dengan documentType=PASSPORT pada gambar tanpa MRZ terbaca → confidence 0, perluVerifikasiManual true
✅ Hapus kamar yang punya reservasi aktif → 409
✅ Set kamar ke MAINTENANCE saat ada reservasi aktif → 409
✅ Checkout dengan actualCheckOutTime melewati expectedCheckOutTime → lateFee terhitung benar
✅ Generate invoice number pada hari yang sama dua kali berturut → sequence naik (0001, 0002)
✅ Export laporan oleh RECEPTIONIST → 403
✅ Export laporan tercatat di activity_logs
✅ Webhook WA tanpa signature valid → 401
✅ OCR endpoint timeout (mock service lambat) → 502, bukan crash/hang
✅ @Cron() checkout-reminder tidak mengirim ulang reservasi yang waReminderSentAt sudah terisi
```

### 9.4 Command Testing

```bash
pnpm test               # semua unit test
pnpm test:e2e           # e2e test (butuh test database)
pnpm test:cov           # dengan laporan coverage
```

---

## 10. Deployment

```yaml
target: Railway atau Fly.io
region: Singapore (latensi rendah ke Indonesia)
database: Supabase Postgres, region Singapore
storage: Supabase Storage bucket privat "identity-documents" (KTP/Paspor/SIM)
cron: @nestjs/schedule berjalan native di dalam proses Nest yang sama —
      TIDAK butuh proses/container terpisah, karena Nest selalu long-running
      (ini justru alasan utama migrasi dari Next.js — lihat diskusi sebelumnya)

build_command: pnpm install && pnpm prisma generate && pnpm build
start_command: node dist/main.js
health_check_path: /health

env_vars_wajib: lihat §2 — semua variabel harus di-set di dashboard platform
                sebelum deploy pertama; aplikasi akan GAGAL start otomatis
                jika env wajib tidak lengkap (§5.6, fail-fast validation)
```

**Checklist sebelum deploy production:**
- [ ] Semua env var production berbeda dari development (terutama `JWT_SECRET`)
- [ ] `NODE_ENV=production`
- [ ] Migration Prisma sudah dijalankan di database production (`pnpm prisma migrate deploy`)
- [ ] `prisma/seed.ts` HANYA dijalankan sekali saat setup awal, bukan setiap deploy
- [ ] `SWAGGER_ENABLED=false` di production, atau lindungi path Swagger dengan Basic Auth tambahan
- [ ] Endpoint `/health` dapat diakses oleh monitoring tool eksternal
- [ ] Rate limiting (`@nestjs/throttler`) aktif di endpoint login
- [ ] CORS (`CORS_ORIGIN`) dikonfigurasi hanya mengizinkan origin dari aplikasi Flutter resmi

---

## 11. Definisi Selesai untuk Agent (Definition of Done per Task)

Sebuah task dari checklist §6 dianggap selesai HANYA jika:

1. Kode ter-compile tanpa error TypeScript (`pnpm build` sukses)
2. Lint tanpa error (`pnpm lint` sukses)
3. Unit test (service) DAN e2e test (controller) terkait ditulis DAN lolos (`pnpm test`, `pnpm test:e2e`)
4. Response format mengikuti konvensi §5.4 (interceptor/filter global menangani envelope, controller tidak membungkus manual)
5. Business rule terkait di §8 (jika relevan) terimplementasi persis dan teruji
6. Aksi sensitif tercatat ke `activity_logs` via `AuditLogsService.log()` sesuai §8.8 (jika relevan)
7. Tidak ada secret/credential yang di-hardcode di kode
8. Module baru terdaftar dengan benar di `app.module.ts` dan tidak menimbulkan circular dependency antar module
