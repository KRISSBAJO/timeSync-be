import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class EndAssignmentDto {
  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ example: 'Assignment ended by transfer.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: { workflowRequestId: 'optional-reference' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
