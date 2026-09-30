import { HttpException, HttpStatus } from '@nestjs/common';

export class ExternalServiceException extends HttpException {
  constructor(message: string) {
    super({ message, code: 'EXTERNAL_SERVICE_ERROR' }, HttpStatus.BAD_GATEWAY);
  }
}
