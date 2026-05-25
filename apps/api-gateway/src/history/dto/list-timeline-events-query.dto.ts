import { ApiPropertyOptional } from '@nestjs/swagger';
import { TimelineEventType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ListTimelineEventsQueryDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;

  @ApiPropertyOptional({ enum: TimelineEventType })
  @IsOptional()
  @IsEnum(TimelineEventType)
  type?: TimelineEventType;

  @ApiPropertyOptional({ example: 'Employee' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ example: 'promoted' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'timeline-event-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
