import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export type DocumentType = 'KTP' | 'PASSPORT' | 'SIM';

export class ExtractIdentityDto {
  @ApiProperty({
    enum: ['KTP', 'PASSPORT', 'SIM'],
    example: 'KTP',
    description: 'Jenis dokumen identitas yang dipindai',
  })
  @IsString()
  @IsNotEmpty({ message: 'documentType wajib diisi' })
  @IsIn(['KTP', 'PASSPORT', 'SIM'], {
    message: 'documentType harus berupa KTP, PASSPORT, atau SIM',
  })
  documentType: DocumentType;
}
