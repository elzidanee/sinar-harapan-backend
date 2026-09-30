import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Token refresh opsional — bila dikirim, dipakai sebagai refresh token eksplisit. Bila tidak dikirim, memakai token dari header Authorization.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
