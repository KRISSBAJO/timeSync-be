import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PositionStatusTransitionDto {
  @ApiPropertyOptional({ example: 'Approved workforce plan update.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @ApiPropertyOptional({ example: { workflowRequestId: 'optional-reference' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
