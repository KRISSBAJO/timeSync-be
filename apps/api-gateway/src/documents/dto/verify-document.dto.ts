import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyDocumentDto {
  @ApiPropertyOptional({ example: 'Verified against original government document.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ example: { verifiedByProvider: 'manual-review' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
