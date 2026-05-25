import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional } from 'class-validator';

export class UpdateTenantFeatureDto {
  @ApiPropertyOptional({ example: '2026-06-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  @ApiPropertyOptional({ example: { employees: 5000, storageMb: 102400 } })
  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { requireApprovals: true } })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}

