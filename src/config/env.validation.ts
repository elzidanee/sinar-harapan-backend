import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString() DATABASE_URL: string;
  // security.md §4.1: JWT_SECRET minimum 32 karakter random, beda antara dev/staging/production
  @IsString() @MinLength(32) JWT_SECRET: string;

  @IsOptional() @IsString() JWT_EXPIRES_IN?: string = '12h';
  @IsOptional() @IsNumber() BCRYPT_SALT_ROUNDS?: number = 10;

  @IsOptional() @IsString() SUPABASE_URL?: string;
  @IsOptional() @IsString() SUPABASE_SERVICE_ROLE_KEY?: string;
  @IsOptional() @IsString() SUPABASE_STORAGE_BUCKET?: string = 'identity-documents';
  @IsOptional() @IsNumber() SUPABASE_SIGNED_URL_EXPIRY_SECONDS?: number = 900;

  @IsOptional() @IsString() GOOGLE_CLOUD_PROJECT_ID?: string;
  @IsOptional() @IsString() GOOGLE_APPLICATION_CREDENTIALS_JSON?: string;
  @IsOptional() @IsString() GOOGLE_VISION_API_KEY?: string;
  @IsOptional() @IsNumber() OCR_TIMEOUT_MS?: number = 3000;

  @IsOptional() @IsIn(['fonnte', 'wablas']) WA_PROVIDER?: string = 'fonnte';
  @IsOptional() @IsString() WA_API_TOKEN?: string;
  @IsOptional() @IsString() WA_API_BASE_URL?: string;
  @IsOptional() @IsString() WA_WEBHOOK_SECRET?: string;

  @IsOptional() CRON_CHECKOUT_REMINDER_ENABLED?: boolean = true;
  @IsOptional() @IsString() CRON_TIMEZONE?: string = 'Asia/Jakarta';

  @IsOptional() @IsNumber() LOGIN_RATE_LIMIT_MAX?: number = 5;
  @IsOptional() @IsNumber() LOGIN_RATE_LIMIT_WINDOW_MS?: number = 60000;

  @IsOptional() SWAGGER_ENABLED?: boolean = true;
  @IsOptional() @IsString() SWAGGER_PATH?: string = 'api-docs';

  @IsOptional() @IsString() CORS_ORIGIN?: string;
  @IsOptional() @IsNumber() PORT?: number = 3000;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment variable tidak valid: ${errors.toString()}`);
  }
  return validated;
}
