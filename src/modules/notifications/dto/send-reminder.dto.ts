import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendReminderDto {
  @ApiProperty({
    example: 'd9b2d63d-a233-4f9e-9d29-c70f0bdf20b3',
    description: 'ID unik reservasi yang ingin dikirimkan pengingat check-out',
  })
  @IsUUID('4', { message: 'reservationId harus berupa UUID v4 yang valid' })
  reservationId: string;
}
