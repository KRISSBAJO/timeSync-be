import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTenantSubscriptionDto {
  @ApiPropertyOptional({ example: 'ENTERPRISE' })
  @IsOptional()
  @IsString()
  planCode?: string;

  @ApiPropertyOptional({ example: 'Enterprise' })
  @IsOptional()
  @IsString()
  planName?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '2026-05-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-05-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsInt()
  @Min(1)
  userLimit?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeLimit?: number;

  @ApiPropertyOptional({ example: 102400 })
  @IsOptional()
  @IsInt()
  @Min(1)
  storageLimitMb?: number;

  @ApiPropertyOptional({ example: { billingProvider: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

