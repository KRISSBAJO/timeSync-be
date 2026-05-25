import { ApiPropertyOptional } from '@nestjs/swagger';
import { PositionStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListPositionsQueryDto {
  @ApiPropertyOptional({ enum: PositionStatus })
  @IsOptional()
  @IsEnum(PositionStatus)
  status?: PositionStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  organizationNodeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  costCenterId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  gradeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  levelId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  reportsToPositionId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isExecutive?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Return only positions with vacant headcount.' })
  @IsOptional()
  @IsBoolean()
  vacantOnly?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Return only positions over budgeted headcount.' })
  @IsOptional()
  @IsBoolean()
  overBudgetOnly?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ example: 'manager' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ example: 'position-id-cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
