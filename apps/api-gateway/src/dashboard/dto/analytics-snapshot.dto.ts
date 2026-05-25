import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

import { DashboardPeriod } from './dashboard-query.dto';

export enum AnalyticsSnapshotKey {
  EXECUTIVE_OVERVIEW = 'EXECUTIVE_OVERVIEW',
  WORKFORCE_OVERVIEW = 'WORKFORCE_OVERVIEW',
  POSITION_CONTROL = 'POSITION_CONTROL',
  OPERATIONAL_HEALTH = 'OPERATIONAL_HEALTH',
  RISK_REGISTER = 'RISK_REGISTER',
}

export class ListAnalyticsSnapshotsQueryDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ enum: AnalyticsSnapshotKey })
  @IsOptional()
  @IsEnum(AnalyticsSnapshotKey)
  key?: AnalyticsSnapshotKey;

  @ApiPropertyOptional({ example: 'LAST_30_DAYS' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'analytics-snapshot-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class RefreshAnalyticsSnapshotDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ enum: AnalyticsSnapshotKey, default: AnalyticsSnapshotKey.EXECUTIVE_OVERVIEW })
  @IsOptional()
  @IsEnum(AnalyticsSnapshotKey)
  key?: AnalyticsSnapshotKey = AnalyticsSnapshotKey.EXECUTIVE_OVERVIEW;

  @ApiPropertyOptional({ enum: DashboardPeriod, default: DashboardPeriod.LAST_30_DAYS })
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod = DashboardPeriod.LAST_30_DAYS;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
