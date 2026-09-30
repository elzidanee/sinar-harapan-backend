import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OcrModule } from './modules/ocr/ocr.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { validateEnv } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('LOGIN_RATE_LIMIT_WINDOW_MS') ?? 60000,
          limit: config.get<number>('LOGIN_RATE_LIMIT_MAX') ?? 5,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    RoomsModule,
    StorageModule,
    OcrModule,
    ReservationsModule,
    NotificationsModule,
    AuditLogsModule,
    ReportsModule,
  ],
})
export class AppModule {}