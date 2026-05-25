import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutboxStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListOutboxMessagesQueryDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ enum: OutboxStatus })
  @IsOptional()
  @IsEnum(OutboxStatus)
  status?: OutboxStatus;

  @ApiPropertyOptional({ example: 'employee.hired' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ example: 'Employee' })
  @IsOptional()
  @IsString()
  aggregateType?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsString()
  aggregateId?: string;

  @ApiPropertyOptional({ example: '2026-05-16T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  availableBefore?: string;

  @ApiPropertyOptional({ example: 'employee' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'outbox-message-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
