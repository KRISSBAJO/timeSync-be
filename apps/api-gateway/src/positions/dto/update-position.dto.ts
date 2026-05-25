import { ApiPropertyOptional } from '@nestjs/swagger';
import { PositionStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePositionDto {
  @ApiPropertyOptional({ example: 'POS-HR-001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code?: string;

  @ApiPropertyOptional({ example: 'Senior HR Operations Manager' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'Owns HR shared-services operations.', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: PositionStatus })
  @IsOptional()
  @IsEnum(PositionStatus)
  status?: PositionStatus;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  organizationNodeId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  costCenterId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  gradeId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  levelId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  reportsToPositionId?: string | null;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  budgetedHeadcount?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Allow budgeted headcount to be set below current occupancy.',
  })
  @IsOptional()
  @IsBoolean()
  allowUnderBudget?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isExecutive?: boolean;

  @ApiPropertyOptional({ example: { family: 'People Operations' }, nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
