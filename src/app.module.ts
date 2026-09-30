import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { validateEnv } from './config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
  ],
})
export class AppModule {}