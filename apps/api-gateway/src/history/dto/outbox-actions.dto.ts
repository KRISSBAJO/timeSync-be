import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RetryOutboxMessageDto {
  @ApiPropertyOptional({ example: '2026-05-17T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  availableAt?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  resetAttempts?: boolean;

  @ApiPropertyOptional({ example: 'Manual retry after provider outage.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ProcessOutboxMessagesDto {
  @ApiPropertyOptional({ example: 25, default: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @ApiPropertyOptional({ example: 8, default: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  maxAttempts?: number = 8;

  @ApiPropertyOptional({ example: { worker: 'manual-admin' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, unknown>;
}
