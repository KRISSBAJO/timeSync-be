import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { CreateWorkflowStepDto } from './workflow-step.dto';

export class CreateWorkflowDto {
  @ApiProperty({ example: 'EMPLOYEE_TRANSFER' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Z0-9_.-]+$/)
  code!: string;

  @ApiProperty({ example: 'Employee Transfer Approval' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ example: 'Approval policy for employee transfers.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 'employees' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  module!: string;

  @ApiPropertyOptional({ enum: WorkflowStatus, default: WorkflowStatus.DRAFT })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiPropertyOptional({ example: 'employee.transfer.requested' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  triggerKey?: string;

  @ApiPropertyOptional({ example: { employmentTypes: ['FULL_TIME'] } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { version: 1 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [CreateWorkflowStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkflowStepDto)
  steps?: CreateWorkflowStepDto[];
}
