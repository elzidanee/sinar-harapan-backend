import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.use(helmet());
  // security.md §9: CORS dibatasi ke origin resmi — tanpa wildcard di production.
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && (!corsOrigins || corsOrigins.length === 0)) {
    throw new Error('CORS_ORIGIN wajib di-set di production (tanpa wildcard *)');
  }
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor());

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
  console.log(`Server jalan di http://localhost:${process.env.PORT ?? 3000}`);
}
void bootstrap();
