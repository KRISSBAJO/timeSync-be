import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStepType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkflowStepDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  stepOrder?: number;

  @ApiProperty({ example: 'HR review' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ enum: WorkflowStepType, default: WorkflowStepType.APPROVAL })
  @IsOptional()
  @IsEnum(WorkflowStepType)
  type?: WorkflowStepType;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  approverRoleId?: string;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081' })
  @IsOptional()
  @IsUUID('4')
  approverUserId?: string;

  @ApiPropertyOptional({ example: { expression: 'employee.manager' } })
  @IsOptional()
  @IsObject()
  approverExpression?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  allowDelegation?: boolean;

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  slaHours?: number;

  @ApiPropertyOptional({ example: { countries: ['US', 'NG'] } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { escalationRole: 'HR_ADMIN' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateWorkflowStepDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  stepOrder?: number;

  @ApiPropertyOptional({ example: 'Executive approval' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: WorkflowStepType })
  @IsOptional()
  @IsEnum(WorkflowStepType)
  type?: WorkflowStepType;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  approverRoleId?: string | null;

  @ApiPropertyOptional({ example: 'fbe772b8-6fd8-4192-a168-20bdf45f0081', nullable: true })
  @IsOptional()
  @IsUUID('4')
  approverUserId?: string | null;

  @ApiPropertyOptional({ example: { expression: 'employee.manager' }, nullable: true })
  @IsOptional()
  @IsObject()
  approverExpression?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  allowDelegation?: boolean;

  @ApiPropertyOptional({ example: 72, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  slaHours?: number | null;

  @ApiPropertyOptional({ example: { countries: ['US'] }, nullable: true })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: { escalationRole: 'HR_ADMIN' }, nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
