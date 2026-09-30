import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const resp =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as { code?: unknown; message?: unknown })
        : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (resp?.message ?? 'Terjadi kesalahan pada server');

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error('[UNHANDLED_ERROR]', exception);
    }

    response.status(status).json({
      success: false,
      error: {
        code: resp?.code ?? mapStatusToCode(status),
        message: Array.isArray(message) ? message.join(', ') : message,
        ...(Array.isArray((resp as { message?: unknown })?.message) && {
          fields: (resp as { message?: unknown[] }).message,
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