import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreatePositionDto {
  @ApiProperty({ example: 'POS-HR-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'HR Operations Manager' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ example: 'Owns HR shared-services operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ enum: PositionStatus, default: PositionStatus.DRAFT })
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

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  budgetedHeadcount?: number;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isExecutive?: boolean;

  @ApiPropertyOptional({
    example: {
      family: 'People Operations',
      jobCode: 'HRM-OPS',
      complianceRequired: true,
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
