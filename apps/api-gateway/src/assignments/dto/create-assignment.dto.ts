import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsUUID('4')
  employeeId!: string;

  @ApiPropertyOptional({ enum: AssignmentType, default: AssignmentType.PRIMARY })
  @IsOptional()
  @IsEnum(AssignmentType)
  type?: AssignmentType;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  positionId?: string;

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
  managerEmployeeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  supervisorEmployeeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  unitHeadEmployeeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  gradeId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  levelId?: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2027-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'When creating a primary assignment, end the currently active primary assignment at effectiveFrom.',
  })
  @IsOptional()
  @IsBoolean()
  closeExistingPrimary?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Allow a position to exceed budgeted headcount.',
  })
  @IsOptional()
  @IsBoolean()
  allowOverBudget?: boolean;

  @ApiPropertyOptional({ example: 'Approved transfer into HR Operations.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ example: { workflowRequestId: 'optional-reference' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
