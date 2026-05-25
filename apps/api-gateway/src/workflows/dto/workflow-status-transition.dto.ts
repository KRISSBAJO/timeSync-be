import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class WorkflowStatusTransitionDto {
  @ApiPropertyOptional({ example: 'Approved by platform governance.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: { release: 'phase-10' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
