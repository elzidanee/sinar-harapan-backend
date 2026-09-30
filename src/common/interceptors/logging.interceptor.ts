import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          // PII protection: TIDAK PERNAH mencatat body request/response mentah ke log
          this.logger.log(`${method} ${originalUrl} ${statusCode} - ${duration}ms [IP: ${ip ?? '-'}]`);
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const status = err?.status ?? res.statusCode ?? 500;
          this.logger.warn(
            `${method} ${originalUrl} ${status} - ${duration}ms [IP: ${ip ?? '-'}] - ${err?.message ?? 'Unknown error'}`,
          );
        },
      }),
    );
  }
}
