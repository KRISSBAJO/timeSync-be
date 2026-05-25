import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ListDashboardWidgetsQueryDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ example: 'dashboard' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean = true;
}

export class UpsertDashboardWidgetDto {
  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;

  @ApiPropertyOptional({ example: 'WORKFORCE_HEADCOUNT' })
  @IsString()
  @MaxLength(100)
  code!: string;

  @ApiPropertyOptional({ example: 'Workforce Headcount' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'dashboard' })
  @IsString()
  @MaxLength(80)
  module!: string;

  @ApiPropertyOptional({ example: { size: 'large', order: 10 } })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class UpdateDashboardWidgetDto extends PartialType(UpsertDashboardWidgetDto) {}
