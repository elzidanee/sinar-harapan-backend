import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (
          data &&
          typeof data === 'object' &&
          'items' in data &&
          'pagination' in data
        ) {
          const { items, pagination } = data as { items: unknown; pagination: unknown };
          return {
            success: true,
            data: items,
            pagination,
            meta: { timestamp: new Date().toISOString() },
          };
        }

        return {
          success: true,
          data,
          meta: { timestamp: new Date().toISOString() },
        };
      }),
    );
  }
}